# E*NKI Avatar Runtime

Portrait-agent photoréaliste animé en temps réel. E*NKI reste face caméra, cadré au buste, et réagit sans génération d’image pendant la conversation.

## Pourquoi un moteur 2.5D

Le rendu combine cinq portraits préchargés et un shader WebGL. Le navigateur anime la respiration, les micro-mouvements du visage, le regard, le clignement et les transitions entre formes de bouche. Cette architecture privilégie l’identité visuelle et la réactivité : une fois les textures chargées, le GPU ne fait que les composer localement.

## Capacités

- états `idle`, `listening`, `thinking` et `speaking` ;
- clignement naturel et micro-mouvements du buste ;
- suivi discret du pointeur ou regard piloté par l’agent ;
- trois formes de bouche couvrant quinze visèmes ;
- réaction au niveau audio du microphone ;
- démonstrateur vocal via la synthèse du navigateur ;
- pont WebSocket pour piloter l’avatar depuis un agent ;
- affiche statique de secours si WebGL est indisponible.

Les assets de production sont sous `public/avatar2d/`. Leur identité, leur cadrage et leur table de visèmes sont décrits dans `avatar/portrait-contract.json`.

## Lancer le projet

```bash
npm run install:ci
npm run avatar:validate
npm run dev
```

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

Le jeu WebP pèse moins de 1,5 Mo et est validé automatiquement par GitHub Actions. Aucun serveur GPU, ComfyUI, Blender ou modèle génératif n’est requis à l’exécution.

## Licence

Le choix de licence du code et des assets E*NKI doit être finalisé avant une diffusion publique stable.
