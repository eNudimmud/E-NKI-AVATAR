import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("..", import.meta.url));

test("ships an installable Hermes dashboard plugin", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "dashboard/manifest.json"), "utf8"));
  const pluginYaml = await readFile(path.join(root, "plugin.yaml"), "utf8");
  const pluginModule = await readFile(path.join(root, "__init__.py"), "utf8");
  const pluginApi = await readFile(path.join(root, "plugin_api.py"), "utf8");

  assert.equal(manifest.name, "enki-avatar");
  assert.equal(manifest.tab.path, "/enki-avatar");
  assert.equal(manifest.entry, "dist/index.js");
  assert.equal(manifest.css, "dist/style.css");
  assert.match(pluginYaml, /^name: enki-avatar$/m);
  assert.match(pluginYaml, /^version: 0\.3\.0$/m);
  assert.match(pluginModule, /^def register\(ctx\):$/m);
  assert.match(pluginApi, /@router\.get\("\/avatar\/\{filename\}"/);
  assert.match(pluginApi, /filename not in _ASSETS/);
});

test("uses authenticated Hermes transports and streaming audio", async () => {
  const bundle = await readFile(path.join(root, "dashboard/dist/index.js"), "utf8");

  assert.match(bundle, /SDK\.buildWsUrl\("\/api\/ws"\)/);
  assert.match(bundle, /SDK\.buildWsUrl\("\/api\/audio\/speak-stream"\)/);
  assert.match(bundle, /SDK\.fetchJSON\("\/api\/audio\/transcribe"/);
  assert.match(bundle, /"session\.create"/);
  assert.match(bundle, /"prompt\.submit"/);
  assert.match(bundle, /"session\.interrupt"/);
  assert.doesNotMatch(bundle, /API_SERVER_KEY/);
  assert.doesNotMatch(bundle, /__HERMES_SESSION_TOKEN__/);
});

test("registers and renders the E*NKI dashboard surface", async () => {
  const bundle = await readFile(path.join(root, "dashboard/dist/index.js"), "utf8");
  let Page = null;
  const window = {
    location: { href: "https://hermes.example/enki-avatar" },
    __HERMES_PLUGIN_SDK__: {
      React,
      hooks: {
        useEffect: React.useEffect,
        useRef: React.useRef,
        useState: React.useState,
      },
    },
    __HERMES_PLUGINS__: {
      register(name, component) {
        assert.equal(name, "enki-avatar");
        Page = component;
      },
    },
  };

  vm.runInNewContext(bundle, {
    Array,
    URL,
    document: {
      currentScript: { src: "https://hermes.example/dashboard-plugins/enki-avatar/dist/index.js" },
      scripts: [],
    },
    window,
  });

  assert.equal(typeof Page, "function");
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /class="enki-plugin enki-state-idle"/);
  assert.match(html, /E\*NKI/);
  assert.match(html, /Activer la conversation/);
  assert.match(html, /enki-base\.webp/);
  assert.match(html, /\/api\/plugins\/enki-avatar\/avatar\/enki-base\.webp/);
});

test("serves the canonical portrait set without duplicating it", async () => {
  const pluginApi = await readFile(path.join(root, "plugin_api.py"), "utf8");
  for (const name of [
    "enki-base.webp",
    "enki-blink.webp",
    "enki-mouth-aa.webp",
    "enki-mouth-e.webp",
    "enki-mouth-o.webp",
  ]) {
    await readFile(path.join(root, "public/avatar2d", name));
    assert.match(pluginApi, new RegExp(name.replace(".", "\\.")));
  }
});
