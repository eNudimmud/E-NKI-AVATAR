#!/usr/bin/env python3
"""Build the E*NKI organic agent avatar without opening Blender's UI.

Run with:
  blender --background --factory-startup --python scripts/blender/build_enki_avatar.py -- \
    --output-root artifacts

The generator intentionally uses Blender primitives and standard materials only.
It creates an editable .blend source, a web-ready GLB, fifteen facial visemes and
three neutral-lighting validation renders. The geometry is a reproducible base
mesh for art-direction iterations, not a scan of the private reference images.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = PROJECT_ROOT / "avatar" / "rig-contract.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the E*NKI Blender avatar")
    parser.add_argument("--output-root", type=Path, default=PROJECT_ROOT / "artifacts")
    parser.add_argument("--contract", type=Path, default=CONTRACT_PATH)
    parser.add_argument("--skip-renders", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def load_contract(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.armatures,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def set_scene_defaults() -> None:
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.engine = "BLENDER_EEVEE_NEXT" if bpy.app.version >= (4, 2, 0) else "BLENDER_EEVEE"
    scene.render.image_settings.color_mode = "RGB"
    scene.world.color = (0.006, 0.006, 0.006)
    scene.frame_start = 1
    scene.frame_end = 96
    scene.render.fps = 30
    view = scene.view_settings
    if hasattr(view, "look"):
        available = {item.name for item in view.bl_rna.properties["look"].enum_items}
        if "AgX - Medium High Contrast" in available:
            view.look = "AgX - Medium High Contrast"


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    specular: float = 0.35,
    fur_bump: bool = False,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    material.metallic = metallic
    material.roughness = roughness
    nodes = material.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    specular_socket = principled.inputs.get("Specular IOR Level") or principled.inputs.get("Specular")
    if specular_socket:
        specular_socket.default_value = specular
    if fur_bump:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 135.0
        noise.inputs["Detail"].default_value = 2.0
        noise.inputs["Roughness"].default_value = 0.78
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.12
        bump.inputs["Distance"].default_value = 0.015
        material.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        material.node_tree.links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return material


def parent_keep_world(child: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world


def empty(name: str, location=(0.0, 0.0, 0.0), parent=None) -> bpy.types.Object:
    result = bpy.data.objects.new(name, None)
    result.empty_display_type = "PLAIN_AXES"
    result.empty_display_size = 0.16
    result.location = location
    bpy.context.collection.objects.link(result)
    if parent:
        parent_keep_world(result, parent)
    return result


def smooth_mesh(obj: bpy.types.Object) -> None:
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def apply_scale(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def uv_sphere(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    parent=None,
    segments: int = 48,
    rings: int = 32,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    smooth_mesh(obj)
    obj.data.materials.append(material)
    if parent:
        parent_keep_world(obj, parent)
    return obj


def cube(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    parent=None,
    rotation=(0.0, 0.0, 0.0),
    bevel: float = 0.05,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("Soft tailoring", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    if parent:
        parent_keep_world(obj, parent)
    return obj


def polygon_prism(
    name: str,
    outline: list[tuple[float, float]],
    front_y: float,
    depth: float,
    material: bpy.types.Material,
    parent=None,
    bevel: float = 0.025,
) -> bpy.types.Object:
    """Create a shallow tailored panel from an x/z outline."""
    back_y = front_y + depth
    count = len(outline)
    vertices = [(x, front_y, z) for x, z in outline]
    vertices.extend((x, back_y, z) for x, z in outline)
    faces = [tuple(range(count)), tuple(range((count * 2) - 1, count - 1, -1))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("Tailored edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    if parent:
        parent_keep_world(obj, parent)
    return obj


def tapered_ear(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    parent=None,
    lean: float = 0.0,
    segments: int = 48,
    rings: int = 32,
) -> bpy.types.Object:
    """A pointed, slightly asymmetric ear derived from a smooth sphere."""
    obj = uv_sphere(name, location, scale, material, parent, segments, rings)
    z_min = min(vertex.co.z for vertex in obj.data.vertices)
    z_max = max(vertex.co.z for vertex in obj.data.vertices)
    height = max(0.001, z_max - z_min)
    for vertex in obj.data.vertices:
        t = (vertex.co.z - z_min) / height
        top_taper = max(0.22, 1.0 - (0.74 * (t ** 2.4)))
        root_taper = 0.80 + (0.20 * min(1.0, t / 0.24))
        vertex.co.x *= top_taper * root_taper
        vertex.co.y *= 0.92 + (0.08 * (1.0 - t))
        vertex.co.x += lean * ((t - 0.18) ** 1.45 if t >= 0.18 else 0.0)
    obj.data.update()
    return obj


def cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    parent=None,
    rotation=(0.0, 0.0, 0.0),
    vertices=48,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if parent:
        parent_keep_world(obj, parent)
    return obj


def curve_line(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
    parent=None,
) -> bpy.types.Object:
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 2
    data.bevel_depth = radius
    data.bevel_resolution = 2
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    if parent:
        parent_keep_world(obj, parent)
    return obj


def create_armature(root: bpy.types.Object, contract: dict) -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("ENKI_Armature")
    armature = bpy.data.objects.new("ENKI_Rig", armature_data)
    bpy.context.collection.objects.link(armature)
    parent_keep_world(armature, root)
    armature.show_in_front = True
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    definitions = {
        "root": ((0, 0, -0.15), (0, 0, 0.25), None),
        "spine": ((0, 0, 0.25), (0, 0, 1.25), "root"),
        "neck": ((0, 0, 1.25), (0, 0, 1.62), "spine"),
        "head": ((0, 0, 1.62), (0, 0, 2.25), "neck"),
        "jaw": ((0, -0.33, 1.80), (0, -0.67, 1.62), "head"),
        "eye.L": ((-0.24, -0.36, 2.02), (-0.24, -0.68, 2.02), "head"),
        "eye.R": ((0.24, -0.36, 2.02), (0.24, -0.68, 2.02), "head"),
        "ear.L.01": ((-0.31, 0.0, 2.31), (-0.34, 0.0, 2.92), "head"),
        "ear.L.02": ((-0.34, 0.0, 2.92), (-0.29, 0.0, 3.42), "ear.L.01"),
        "ear.R.01": ((0.31, 0.0, 2.31), (0.34, 0.0, 2.92), "head"),
        "ear.R.02": ((0.34, 0.0, 2.92), (0.29, 0.0, 3.42), "ear.R.01"),
    }
    bones = {}
    for bone_name in contract["rigBones"]:
        head, tail, parent_name = definitions[bone_name]
        bone = armature_data.edit_bones.new(bone_name)
        bone.head = head
        bone.tail = tail
        if parent_name:
            bone.parent = bones[parent_name]
            bone.use_connect = bone.head == bone.parent.tail
        bones[bone_name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    armature["enki_rig_version"] = contract["version"]
    return armature


def create_mouth_with_visemes(
    jaw: bpy.types.Object,
    contract: dict,
    mouth_material: bpy.types.Material,
) -> bpy.types.Object:
    mouth = uv_sphere(
        "Mouth",
        (0.0, -0.652, 1.705),
        (0.155, 0.028, 0.040),
        mouth_material,
        parent=jaw,
        segments=48,
        rings=24,
    )
    basis = mouth.shape_key_add(name="Basis")
    basis.interpolation = "KEY_LINEAR"
    source = [vertex.co.copy() for vertex in basis.data]
    for viseme in contract["visemes"]:
        key = mouth.shape_key_add(name=f"viseme_{viseme['name']}")
        key.interpolation = "KEY_LINEAR"
        openness = float(viseme["open"])
        wide = float(viseme["wide"])
        rounded = float(viseme["round"])
        horizontal = 1.0 + (wide * 0.72) - (rounded * 0.48)
        vertical = 1.0 + (openness * 3.45) + (rounded * 0.42)
        depth = 1.0 + (openness * 0.65) + (rounded * 0.22)
        for point, original in zip(key.data, source):
            lower = max(0.0, -original.z / 0.040)
            point.co.x = original.x * horizontal
            point.co.y = original.y * depth
            point.co.z = original.z * vertical - lower * openness * 0.030
        key.value = 0.0
    mouth["enki_visemes"] = ",".join(item["name"] for item in contract["visemes"])
    return mouth


def build_avatar(contract: dict) -> dict[str, bpy.types.Object]:
    colors = {
        "fur": make_material("Fur_OffWhite", (0.72, 0.70, 0.65, 1), 0.90, fur_bump=True),
        "fur_shadow": make_material("Fur_Shadow", (0.48, 0.46, 0.42, 1), 0.93, fur_bump=True),
        "muzzle": make_material("Fur_Muzzle", (0.84, 0.82, 0.76, 1), 0.94, fur_bump=True),
        "inner": make_material("Ear_Inner", (0.36, 0.18, 0.17, 1), 0.86),
        "hood": make_material("Hood_Charcoal", (0.030, 0.029, 0.030, 1), 0.96),
        "suit": make_material("Suit_Charcoal", (0.060, 0.059, 0.061, 1), 0.88),
        "lapel": make_material("Suit_Lapel", (0.045, 0.043, 0.042, 1), 0.72),
        "shirt": make_material("Shirt_Black", (0.012, 0.012, 0.012, 1), 0.90),
        "tie": make_material("Tie_Black_Satin", (0.016, 0.014, 0.014, 1), 0.44),
        "nose": make_material("Nose_Warm", (0.20, 0.115, 0.10, 1), 0.54),
        "mouth": make_material("Mouth_Interior", (0.075, 0.018, 0.022, 1), 0.72),
        "sclera": make_material("Eye_Sclera", (0.72, 0.70, 0.65, 1), 0.36),
        "iris_red": make_material("Iris_Right_OrangeRed", (0.72, 0.10, 0.035, 1), 0.24),
        "iris_amber": make_material("Iris_Left_Amber", (0.90, 0.48, 0.045, 1), 0.24),
        "pupil": make_material("Eye_Pupil", (0.004, 0.003, 0.003, 1), 0.28),
        "whisker": make_material("Whisker", (0.73, 0.71, 0.66, 1), 0.62),
        "teeth": make_material("Teeth", (0.83, 0.80, 0.71, 1), 0.60),
    }

    root = empty("EnkiRoot")
    root["enki_rig_version"] = contract["version"]
    root["identity"] = contract["identity"]["species"]
    head_control = empty("HeadRig", (0.0, 0.0, 1.52), root)
    jaw = empty("Jaw", (0.0, -0.38, 1.76), head_control)
    eye_l = empty("Eye_L", (-0.18, -0.445, 2.08), head_control)
    eye_r = empty("Eye_R", (0.18, -0.445, 2.08), head_control)
    ear_l = empty("Ear_L", (-0.22, -0.005, 2.42), head_control)
    ear_r = empty("Ear_R", (0.22, -0.005, 2.42), head_control)

    create_armature(root, contract)

    # A tapered human-like bust keeps the silhouette elegant instead of toy-like.
    polygon_prism(
        "Jacket",
        [(-0.58, 0.02), (-0.72, 0.56), (-0.68, 1.10), (-0.48, 1.48),
         (-0.29, 1.60), (0.29, 1.60), (0.48, 1.48), (0.68, 1.10),
         (0.72, 0.56), (0.58, 0.02)],
        -0.16,
        0.54,
        colors["suit"],
        root,
        bevel=0.055,
    )
    uv_sphere("Shoulder_L", (-0.59, 0.04, 1.08), (0.30, 0.34, 0.33), colors["suit"], root)
    uv_sphere("Shoulder_R", (0.59, 0.04, 1.08), (0.30, 0.34, 0.33), colors["suit"], root)
    uv_sphere("UpperArm_L", (-0.65, 0.08, 0.61), (0.23, 0.28, 0.52), colors["suit"], root)
    uv_sphere("UpperArm_R", (0.65, 0.08, 0.61), (0.23, 0.28, 0.52), colors["suit"], root)
    polygon_prism("Shirt", [(-0.23, 0.50), (-0.25, 1.48), (0.25, 1.48), (0.23, 0.50)], -0.455, 0.035, colors["shirt"], root)
    polygon_prism("Lapel_L", [(-0.46, 1.48), (-0.18, 1.40), (-0.04, 0.88), (-0.29, 1.02)], -0.495, 0.045, colors["lapel"], root, bevel=0.018)
    polygon_prism("Lapel_R", [(0.46, 1.48), (0.18, 1.40), (0.04, 0.88), (0.29, 1.02)], -0.495, 0.045, colors["lapel"], root, bevel=0.018)
    polygon_prism("Tie", [(-0.065, 1.29), (-0.048, 0.62), (0.0, 0.48), (0.048, 0.62), (0.065, 1.29)], -0.535, 0.026, colors["tie"], root, bevel=0.012)
    polygon_prism("TieKnot", [(-0.09, 1.40), (-0.055, 1.28), (0.055, 1.28), (0.09, 1.40)], -0.55, 0.032, colors["tie"], root, bevel=0.014)
    cylinder("Neck", (0, 0.0, 1.48), 0.22, 0.40, colors["fur"], root)

    # The hood is an organic shell and a soft opening seam, not a hard helmet.
    uv_sphere("Hood_Back", (0, 0.10, 2.10), (0.56, 0.35, 0.72), colors["hood"], head_control)
    curve_line(
        "HoodOpening",
        [(-0.39, -0.29, 1.72), (-0.49, -0.30, 1.98), (-0.46, -0.28, 2.28),
         (-0.31, -0.25, 2.52), (0.0, -0.24, 2.61), (0.31, -0.25, 2.52),
         (0.46, -0.28, 2.28), (0.49, -0.30, 1.98), (0.39, -0.29, 1.72)],
        0.072,
        colors["hood"],
        head_control,
    )
    curve_line("HoodFold_L", [(-0.43, -0.20, 1.77), (-0.49, -0.14, 1.50), (-0.40, -0.05, 1.32)], 0.085, colors["hood"], head_control)
    curve_line("HoodFold_R", [(0.43, -0.20, 1.77), (0.49, -0.14, 1.50), (0.40, -0.05, 1.32)], 0.085, colors["hood"], head_control)

    # Adult lagomorph head: narrow skull, long bridge and restrained muzzle.
    uv_sphere("Skull", (0, -0.10, 2.09), (0.41, 0.35, 0.55), colors["fur"], head_control)
    uv_sphere("FaceBridge", (0, -0.36, 2.02), (0.22, 0.17, 0.35), colors["muzzle"], head_control)
    uv_sphere("Temple_L", (-0.25, -0.26, 2.08), (0.20, 0.20, 0.31), colors["fur"], head_control)
    uv_sphere("Temple_R", (0.25, -0.26, 2.08), (0.20, 0.20, 0.31), colors["fur"], head_control)
    uv_sphere("Muzzle_L", (-0.13, -0.515, 1.84), (0.21, 0.17, 0.19), colors["muzzle"], jaw)
    uv_sphere("Muzzle_R", (0.13, -0.515, 1.84), (0.21, 0.17, 0.19), colors["muzzle"], jaw)
    uv_sphere("Chin", (0, -0.39, 1.67), (0.20, 0.16, 0.13), colors["fur"], jaw)
    uv_sphere("Nose", (0, -0.694, 1.91), (0.078, 0.050, 0.060), colors["nose"], jaw, segments=32, rings=20)
    create_mouth_with_visemes(jaw, contract, colors["mouth"])
    cube("Incisor_L", (-0.032, -0.665, 1.718), (0.025, 0.014, 0.052), colors["teeth"], jaw, bevel=0.009)
    cube("Incisor_R", (0.032, -0.665, 1.718), (0.025, 0.014, 0.052), colors["teeth"], jaw, bevel=0.009)

    def build_eye(control, x, iris_material, suffix):
        uv_sphere(f"EyeSocket_{suffix}", (x, -0.420, 2.075), (0.147, 0.070, 0.112), colors["fur_shadow"], control, segments=40, rings=24)
        uv_sphere(f"EyeGlobe_{suffix}", (x, -0.458, 2.075), (0.119, 0.050, 0.083), colors["sclera"], control, segments=40, rings=24)
        uv_sphere(f"Iris_{suffix}", (x, -0.507, 2.075), (0.052, 0.014, 0.055), iris_material, control, segments=32, rings=20)
        uv_sphere(f"Pupil_{suffix}", (x, -0.521, 2.075), (0.014, 0.009, 0.036), colors["pupil"], control, segments=24, rings=16)

    # Viewer-left eye is the character's right: orange-red. Viewer-right is amber.
    build_eye(eye_l, -0.18, colors["iris_red"], "L")
    build_eye(eye_r, 0.18, colors["iris_amber"], "R")
    curve_line("Brow_L", [(-0.33, -0.485, 2.24), (-0.20, -0.515, 2.24), (-0.07, -0.505, 2.17)], 0.034, colors["fur_shadow"], head_control)
    curve_line("Brow_R", [(0.33, -0.485, 2.24), (0.20, -0.515, 2.24), (0.07, -0.505, 2.17)], 0.034, colors["fur_shadow"], head_control)

    def build_ear(control, x, sign, suffix):
        outer = tapered_ear(f"EarOuter_{suffix}", (x + sign * 0.025, 0.0, 3.00), (0.19, 0.13, 0.68), colors["fur"], control, lean=sign * 0.09, segments=40, rings=28)
        outer.rotation_euler.y = sign * math.radians(-3.0)
        inner = tapered_ear(f"EarInner_{suffix}", (x + sign * 0.024, -0.122, 3.00), (0.094, 0.026, 0.50), colors["inner"], control, lean=sign * 0.045, segments=36, rings=24)
        inner.rotation_euler.y = sign * math.radians(-3.0)

    build_ear(ear_l, -0.31, -1, "L")
    build_ear(ear_r, 0.31, 1, "R")

    # Whiskers are curves so Blender artists can reshape them non-destructively.
    for side in (-1, 1):
        suffix = "L" if side < 0 else "R"
        for index, z_offset in enumerate((-0.08, 0.0, 0.08), start=1):
            start = (side * 0.15, -0.670, 1.84 + z_offset)
            middle = (side * 0.42, -0.735, 1.85 + z_offset * 1.2)
            end = (side * 0.70, -0.665, 1.88 + z_offset * 1.7)
            curve_line(f"Whisker_{suffix}_{index}", [start, middle, end], 0.0032, colors["whisker"], head_control)

    return {
        "root": root,
        "head": head_control,
        "jaw": jaw,
        "eye_l": eye_l,
        "eye_r": eye_r,
        "ear_l": ear_l,
        "ear_r": ear_r,
    }


def add_action(obj: bpy.types.Object, name: str, frames: list[tuple[int, tuple[float, float, float]]]) -> None:
    obj.rotation_mode = "XYZ"
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    for axis in range(3):
        curve = action.fcurves.new(data_path="rotation_euler", index=axis, action_group="Agent state")
        curve.keyframe_points.add(len(frames))
        for point, (frame, rotation) in zip(curve.keyframe_points, frames):
            point.co = (frame, rotation[axis])
            point.interpolation = "BEZIER"
    obj.animation_data_create()
    track = obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, int(frames[0][0]), action)
    strip.action_frame_start = frames[0][0]
    strip.action_frame_end = frames[-1][0]
    track.mute = False


def create_state_animations(controls: dict[str, bpy.types.Object]) -> None:
    head = controls["head"]
    clips = {
        "ENKI_Idle": [
            (1, (0, 0, math.radians(-0.3))),
            (48, (math.radians(0.5), math.radians(0.8), math.radians(0.3))),
            (96, (0, 0, math.radians(-0.3))),
        ],
        "ENKI_Listening": [
            (1, (0, 0, 0)),
            (20, (math.radians(-1.3), 0, 0)),
            (42, (0, math.radians(0.6), 0)),
            (64, (0, 0, 0)),
        ],
        "ENKI_Thinking": [
            (1, (0, 0, 0)),
            (28, (math.radians(1.2), math.radians(-2.2), math.radians(-2.4))),
            (56, (math.radians(0.5), math.radians(-1.0), math.radians(-1.4))),
            (84, (0, 0, 0)),
        ],
        "ENKI_Speaking": [
            (1, (0, 0, 0)),
            (12, (math.radians(-0.8), math.radians(0.7), math.radians(0.4))),
            (24, (math.radians(0.4), math.radians(-0.4), math.radians(-0.3))),
            (36, (0, 0, 0)),
        ],
    }
    for name, frames in clips.items():
        add_action(head, name, frames)


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_render_rig() -> bpy.types.Object:
    floor_material = make_material("Studio_Floor", (0.018, 0.017, 0.016, 1), 0.79, metallic=0.06)
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.18))
    floor = bpy.context.object
    floor.name = "StudioFloor"
    floor.data.materials.append(floor_material)

    def area(name, location, energy, color, size):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        bpy.context.collection.objects.link(obj)
        look_at(obj, (0, 0, 1.65))
        return obj

    area("Key", (-3.8, -4.0, 5.6), 1250, (1.0, 0.74, 0.52), 4.0)
    area("Fill", (3.4, -2.8, 3.4), 620, (0.45, 0.56, 0.70), 3.2)
    area("Rim", (2.5, 2.2, 4.8), 980, (0.88, 0.28, 0.16), 2.6)

    camera_data = bpy.data.cameras.new("ValidationCamera")
    camera = bpy.data.objects.new("ValidationCamera", camera_data)
    camera_data.lens = 68
    camera_data.sensor_width = 36
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    return camera


def render_validation_views(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    camera = add_render_rig()
    views = {
        "front": ((0.0, -7.1, 2.18), (0.0, 0.0, 1.72)),
        "three-quarter": ((3.45, -6.3, 2.45), (0.0, 0.0, 1.78)),
        "profile": ((5.9, -2.0, 2.33), (0.0, 0.0, 1.82)),
    }
    for name, (location, target) in views.items():
        camera.location = location
        look_at(camera, target)
        bpy.context.scene.render.filepath = str(output_dir / f"enki-{name}.png")
        bpy.ops.render.render(write_still=True)


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    kwargs = {
        "filepath": str(path),
        "export_format": "GLB",
        "use_selection": False,
        "export_apply": True,
        "export_extras": True,
        "export_yup": True,
        "export_animations": True,
        "export_nla_strips": True,
        "export_morph": True,
        "export_morph_normal": True,
        "export_morph_tangent": False,
        "export_materials": "EXPORT",
        "export_cameras": False,
        "export_lights": False,
    }
    supported = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    bpy.ops.export_scene.gltf(**{key: value for key, value in kwargs.items() if key in supported})


def save_blend(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), check_existing=False)


def main() -> None:
    args = parse_args()
    contract = load_contract(args.contract.resolve())
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    clear_scene()
    set_scene_defaults()
    controls = build_avatar(contract)
    create_state_animations(controls)

    blend_path = output_root / "enki-organic-v1.blend"
    glb_path = output_root / "enki-organic-v1.glb"
    # Export before adding the validation studio so the web asset contains only
    # E*NKI. The editable .blend saved below keeps the studio for review renders.
    export_glb(glb_path)

    if not args.skip_renders:
        render_validation_views(output_root / "renders")

    save_blend(blend_path)
    print(json.dumps({
        "blend": str(blend_path),
        "glb": str(glb_path),
        "rig_version": contract["version"],
        "visemes": len(contract["visemes"]),
    }, indent=2))


if __name__ == "__main__":
    main()
