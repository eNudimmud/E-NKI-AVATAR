# E*NKI Avatar Runtime

Prototype de moteur d’avatar-agent en temps réel. Le rendu fonctionne localement dans le navigateur avec Three.js et ne génère aucune image pendant la conversation.

## État actuel

- asset GLB généré automatiquement et animé à la fréquence de rendu du navigateur ;
- états `idle`, `listening`, `thinking` et `speaking` ;
- clignements, regard, oreilles, respiration et mâchoire ;
- réaction directe au niveau du microphone ;
- démonstrateur vocal via la synthèse du navigateur ;
- pont WebSocket acceptant les événements de l’agent ;
- vocabulaire de quinze visèmes adapté au futur rig Blender.

Le modèle Blender validé est publié sous `public/models/enki-organic-v1.glb` et chargé en priorité par Three.js. Le modèle `public/models/enki-organic-v0.glb` reste le secours procédural généré par `npm run avatar:build`. La commande `npm run avatar:blender` produit :

- `artifacts/enki-organic-v1.blend`, source éditable ;
- `artifacts/enki-organic-v1.glb`, asset temps réel ;
- trois rendus de contrôle sous `artifacts/renders/`.

Le runtime conserve le modèle procédural de secours tant que le GLB de production n’est pas disponible ou ne respecte pas le contrat.

## Protocole WebSocket

Chaque message est un objet JSON conforme à `protocol/avatar-events.schema.json`.

```json
{
  "state": "speaking",
  "viseme": "AA",
  "intensity": 0.72,
  "gaze": { "x": 0.1, "y": -0.05 }
}
```

Les paquets peuvent ne contenir qu’un seul champ. Les paquets invalides sont ignorés afin que le rendu ne soit jamais bloqué par le trafic de l’agent.

## API navigateur

Le runtime expose aussi `window.enkiAvatar` :

```js
window.enkiAvatar.setState("speaking");
window.enkiAvatar.setViseme("O", 0.8);
window.enkiAvatar.setGaze(0.2, -0.1);
window.enkiAvatar.setInputLevel(0.45);
```

## Pipeline Blender automatisé

Le contrat du modèle se trouve dans `avatar/rig-contract.json`. Il fige les nœuds attendus par Three.js, les os du rig, les quinze visèmes et les quatre clips d’état agent. Le script `scripts/blender/build_enki_avatar.py` construit l’avatar organique en costume anthracite et capuche sombre, conformément aux références de travail, avec l’hétérochromie canonique d’E*NKI.

Le workflow `.github/workflows/build-avatar.yml` installe Blender sur un runner GitHub, exécute la génération headless, valide le GLB puis fournit le `.blend`, le `.glb` et les rendus comme artifact téléchargeable. Aucune connaissance de Blender n’est nécessaire : toute modification du générateur relance la chaîne, et le workflow **Build E*NKI avatar** peut aussi être exécuté manuellement depuis l’onglet Actions.

## Validation locale

```bash
npm run avatar:validate
python3 -m py_compile scripts/blender/build_enki_avatar.py scripts/blender/validate_glb.py
```

Le code du moteur et la licence artistique de l’identité E*NKI resteront séparés avant la publication publique. Les images de référence privées ne sont ni copiées ni embarquées dans le dépôt.
