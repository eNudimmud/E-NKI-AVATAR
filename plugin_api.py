"""Same-origin portrait assets for the E*NKI Hermes dashboard plugin."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse


router = APIRouter()
_ASSET_ROOT = Path(__file__).resolve().parent / "public" / "avatar2d"
_ASSETS = {
    "enki-base.webp",
    "enki-blink.webp",
    "enki-mouth-aa.webp",
    "enki-mouth-e.webp",
    "enki-mouth-o.webp",
}


@router.get("/avatar/{filename}", include_in_schema=False)
async def avatar_asset(filename: str) -> FileResponse:
    """Serve only the five versioned portrait frames shipped by the plugin."""
    if filename not in _ASSETS:
        raise HTTPException(status_code=404, detail="Unknown E*NKI portrait asset")

    asset = _ASSET_ROOT / filename
    if not asset.is_file():
        raise HTTPException(status_code=404, detail="E*NKI portrait asset is missing")

    return FileResponse(
        asset,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
