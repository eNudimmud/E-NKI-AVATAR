#!/usr/bin/env python3
"""Validate the runtime node and facial-animation contract of an E*NKI GLB."""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path


JSON_CHUNK = 0x4E4F534A


def read_glb_json(path: Path) -> dict:
    with path.open("rb") as handle:
        magic, version, total_length = struct.unpack("<4sII", handle.read(12))
        if magic != b"glTF":
            raise ValueError(f"{path} is not a GLB file")
        if version != 2:
            raise ValueError(f"unsupported glTF version: {version}")
        if total_length != path.stat().st_size:
            raise ValueError("GLB header length does not match file size")
        while handle.tell() < total_length:
            chunk_length, chunk_type = struct.unpack("<II", handle.read(8))
            payload = handle.read(chunk_length)
            if chunk_type == JSON_CHUNK:
                return json.loads(payload.rstrip(b" \t\r\n\0").decode("utf-8"))
    raise ValueError("GLB does not contain a JSON chunk")


def collect_target_names(document: dict) -> set[str]:
    names: set[str] = set()
    for mesh in document.get("meshes", []):
        extras = mesh.get("extras", {})
        names.update(extras.get("targetNames", []))
    return names


def validate(document: dict, contract: dict, production: bool) -> list[str]:
    errors: list[str] = []
    nodes = {node.get("name") for node in document.get("nodes", [])}
    missing_nodes = sorted(set(contract["requiredNodes"]) - nodes)
    if missing_nodes:
        errors.append(f"missing nodes: {', '.join(missing_nodes)}")

    if production:
        targets = collect_target_names(document)
        expected_targets = {f"viseme_{item['name']}" for item in contract["visemes"]}
        missing_targets = sorted(expected_targets - targets)
        if missing_targets:
            errors.append(f"missing morph targets: {', '.join(missing_targets)}")

        animations = {animation.get("name") for animation in document.get("animations", [])}
        missing_animations = sorted(set(contract["animations"]) - animations)
        if missing_animations:
            errors.append(f"missing animations: {', '.join(missing_animations)}")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("glb", type=Path)
    parser.add_argument("--contract", type=Path, default=Path("avatar/rig-contract.json"))
    parser.add_argument("--profile", choices=("runtime", "production"), default="production")
    args = parser.parse_args()

    document = read_glb_json(args.glb)
    with args.contract.open("r", encoding="utf-8") as handle:
        contract = json.load(handle)
    errors = validate(document, contract, args.profile == "production")
    if errors:
        raise SystemExit("E*NKI GLB validation failed:\n- " + "\n- ".join(errors))
    print(json.dumps({
        "file": str(args.glb),
        "profile": args.profile,
        "nodes": len(document.get("nodes", [])),
        "meshes": len(document.get("meshes", [])),
        "animations": len(document.get("animations", [])),
        "morph_targets": sorted(collect_target_names(document)),
    }, indent=2))


if __name__ == "__main__":
    main()
