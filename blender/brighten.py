# Brighten and warm a glb's colour textures (e.g. a dull lemon), then re-export it.
#   Blender -b -P brighten.py -- in.glb out.glb gain saturation [tint_hex mix]
import bpy, sys, numpy as np, colorsys
a = sys.argv[sys.argv.index('--') + 1:]
src, out, gain, sat = a[0], a[1], float(a[2]), float(a[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
done = set()
for m in bpy.data.materials:
    if not m.use_nodes: continue
    b = m.node_tree.nodes.get('Principled BSDF')
    if not b or not b.inputs['Base Color'].is_linked: continue
    img = b.inputs['Base Color'].links[0].from_node.image
    if img.name in done: continue
    done.add(img.name)
    px = np.array(img.pixels[:]).reshape(-1, 4)
    rgb = px[:, :3]
    lum = rgb.mean(axis=1, keepdims=True)
    rgb = lum + (rgb - lum) * sat          # more saturated
    rgb = np.clip(rgb * gain, 0, 1)        # brighter
    if len(a) > 4:                         # pull the colour towards a target (keeps the texture's light and dark detail)
        t = np.array([int(a[4][i:i+2], 16) / 255 for i in (0, 2, 4)])
        rel = lum / max(lum.mean(), 1e-4)
        rgb = rgb * (1 - float(a[5])) + np.clip(t * rel, 0, 1) * float(a[5])
    px[:, :3] = rgb
    img.pixels[:] = px.ravel()
    img.pack()
    print('ADJUSTED', img.name, img.size[:])
for o in bpy.context.scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_image_format='JPEG', export_jpeg_quality=85)
