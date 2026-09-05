# E*NKI Avatar Runtime

Portrait-agent photoréaliste animé en temps réel. E*NKI reste face caméra, cadré au buste, et réagit sans génération d’image pendant la conversation.

Le dépôt contient désormais deux surfaces qui partagent le même jeu de portraits, sans le dupliquer :

- le démonstrateur Web autonome ;
- le plugin officiel du dashboard Hermes Cloud, sous `dashboard/`.

## Pourquoi un moteur 2.5D

Le rendu combine cinq portraits préchargés et un shader WebGL. Le navigateur anime la respiration, les micro-mouvements du visage, le regard, le clignement et les transitions entre formes de bouche. Cette architecture privilégie l’identité visuelle et la réactivité : une fois les textures chargées, le GPU ne fait que les composer localement.

## Capacités

- états `idle`, `listening`, `thinking` et `speaking` ;
- clignement naturel et micro-mouvements du buste ;
- suivi discret du pointeur ou regard piloté par l’agent ;
- trois formes de bouche couvrant quinze visèmes ;
- réaction au niveau audio du microphone ;
- conversation mains libres avec détection de fin de phrase ;
- transcription via la configuration STT de Hermes ;
- TTS Hermes en streaming, avec repli automatique sur le TTS par phrase ;
- synchronisation labiale calculée sur le signal audio réellement joué ;
- interruption manuelle immédiate d’un tour en cours ;
- pont WebSocket pour piloter l’avatar depuis un agent ;
- affiche statique de secours si WebGL est indisponible.

Les assets de production sont sous `public/avatar2d/`. Leur identité, leur cadrage et leur table de visèmes sont décrits dans `avatar/portrait-contract.json`.

## Lancer le projet

```bash
npm run install:ci
npm run avatar:validate
npm run dev
```

## Installer dans Hermes Cloud sans terminal

Depuis le chat de l’agent Hermes, envoyez ce message :

> Installe et active le plugin avec `/opt/hermes/bin/hermes plugins install eNudimmud/E-NKI-AVATAR --enable`. Ne modifie pas le dashboard principal et ne révèle aucune clé. Donne-moi seulement le résultat de l’installation.

La liste des plugins est mise en cache par le processus du dashboard. Après une première installation, utilisez son endpoint de rescan avec une session authentifiée ou redémarrez uniquement le dashboard, puis rechargez la page et ouvrez l’onglet **E*NKI**. Au premier clic sur **Activer la conversation**, le navigateur demandera l’autorisation d’utiliser le microphone.

Le plugin est servi par le dashboard lui-même. Sa route backend lit les portraits canoniques sous `public/avatar2d/`, et son interface utilise `SDK.buildWsUrl()` et `SDK.fetchJSON()` : aucun port public, tunnel ou secret côté navigateur n’est nécessaire.

## Architecture Hermes

1. Le plugin crée une session via `session.create` sur `/api/ws`.
2. La parole enregistrée est envoyée à `/api/audio/transcribe`.
3. Le texte est soumis avec `prompt.submit`.
4. Les événements `thinking.delta`, `tool.*` et `message.delta` pilotent l’état de l’avatar en direct.
5. Les fragments `message.delta` alimentent `/api/audio/speak-stream` pendant que la réponse est encore générée.
6. Le PCM reçu est joué immédiatement et son amplitude anime la bouche.

Si le fournisseur TTS ne prend pas en charge les blocs PCM, le plugin se replie sur `/api/audio/speak` après réception de la réponse.

## Protocole WebSocket

Chaque message est un objet JSON conforme à `protocol/avatar-events.schema.json` :

```json
{
  "state": "speaking",
  "viseme": "AA",
  "intensity": 0.72,
  "gaze": { "x": 0.1, "y": -0.05 }
}
```

Les paquets peuvent ne contenir qu’un seul champ. Un paquet mal formé est ignoré sans interrompre le rendu.

## API navigateur

```js
window.enkiAvatar.setState("speaking");
window.enkiAvatar.setViseme("O", 0.8);
window.enkiAvatar.setGaze(0.2, -0.1);
window.enkiAvatar.setInputLevel(0.45);
```

## Performance

Chaque surface charge un jeu WebP de moins de 1,5 Mo, validé automatiquement par GitHub Actions. Aucun serveur GPU, ComfyUI, Blender ou modèle génératif n’est requis à l’exécution.

## Licence

Le choix de licence du code et des assets E*NKI doit être finalisé avant une diffusion publique stable.
