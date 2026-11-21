# Standard metal dessert spoon: oval bowl, slim neck, flat handle with a rounded end, polished steel.
#   Blender -b -P build_spoon.py -- out.glb
import bpy, bmesh, sys, math
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
L = 1.0
def width(x):            # half-width along the spoon; x from 0 (bowl tip) to 1 (handle end)
    if x < 0.36:         # oval bowl
        t = (x - 0.18) / 0.18
        return 0.105 * math.sqrt(max(0.0, 1 - t * t))
    if x < 0.46:         # neck narrows
        t = (x - 0.36) / 0.10
        return 0.105 * math.sqrt(max(0, 1 - 1)) * 0 + (0.03 + (0.016 - 0.03) * t) if t >= 0 else 0.03
    if x < 0.94:         # handle slowly widens
        t = (x - 0.46) / 0.48
        return 0.016 + 0.024 * t
    t = (x - 0.94) / 0.06  # rounded end
    return 0.04 * math.sqrt(max(0.0, 1 - t * t))
def height(x, y):        # dished bowl, then the handle rises gently
    if x < 0.36:
        t = (x - 0.18) / 0.18; w = 0.105
        r2 = t * t + (y / w) ** 2
        return -0.045 * max(0.0, 1 - r2)
    return 0.06 * ((x - 0.36) / 0.64) ** 1.6
NX, NY = 100, 16
bm = bmesh.new()
grid = [[None] * (NY + 1) for _ in range(NX + 1)]
for i in range(NX + 1):
    x = i / NX; w = width(x)
    if x < 0.36 and w < 0.004: w = 0.004
    for j in range(NY + 1):
        y = (j / NY * 2 - 1) * max(w, 0.002)
        grid[i][j] = bm.verts.new((x, y, height(x, y)))
for i in range(NX):
    for j in range(NY):
        bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
me = bpy.data.meshes.new('spoon'); bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new('spoon_body', me); bpy.context.scene.collection.objects.link(ob)
m = bpy.data.materials.new('spoon_steel'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.78, 0.79, 0.81, 1); b.inputs['Metallic'].default_value = 0.85; b.inputs['Roughness'].default_value = 0.22
me.materials.append(m)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
md = ob.modifiers.new('s', 'SOLIDIFY'); md.thickness = 0.012; md.offset = 0
md2 = ob.modifiers.new('ss', 'SUBSURF'); md2.levels = 1
for x in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=x.name)
for p in me.polygons: p.use_smooth = True
ob.rotation_euler = (0, 0, math.radians(90)); bpy.ops.object.transform_apply(rotation=True)   # bowl towards the viewer
s = 0.28 / max(ob.dimensions); ob.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
vs = [v.co for v in me.vertices]; minz = min(v.z for v in vs)
cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
for v in me.vertices: v.co.x -= cx; v.co.y -= cy; v.co.z -= minz
root = bpy.data.objects.new('obj_spoon', None); bpy.context.scene.collection.objects.link(root); ob.parent = root
for o in bpy.context.selected_objects: o.select_set(False)
root.select_set(True); ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('DONE spoon', tuple(round(x, 3) for x in ob.dimensions), len(me.polygons))
