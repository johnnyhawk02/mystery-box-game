# Plain square side table (the simple flat-pack kind): square top, four square legs, light birch finish.
#   Blender -b -P build_table.py -- out.glb
import bpy, bmesh, sys
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
m = bpy.data.materials.new('table_birch'); m.use_nodes = True
b = m.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (*[(int('dcc49c'[i:i+2], 16) / 255) ** 2.2 for i in (0, 2, 4)], 1)
b.inputs['Roughness'].default_value = 0.55
parts = []
def block(sx, sy, sz, x, y, z):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts); bmesh.ops.translate(bm, vec=(x, y, z), verts=bm.verts)
    me = bpy.data.meshes.new('p'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('p', me); bpy.context.scene.collection.objects.link(o); me.materials.append(m)
    md = o.modifiers.new('b', 'BEVEL'); md.width = 0.006; md.segments = 3
    parts.append(o)
W, H, T, L = 0.55, 0.45, 0.05, 0.05
block(W, W, T, 0, 0, H - T / 2)
for sx in (-1, 1):
    for sy in (-1, 1):
        block(L, L, H - T, sx * (W / 2 - L / 2), sy * (W / 2 - L / 2), (H - T) / 2)
for o in bpy.context.selected_objects: o.select_set(False)
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
for o in parts:
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='b')
bpy.ops.object.join(); t = bpy.context.view_layer.objects.active
for p in t.data.polygons: p.use_smooth = False
s = 0.26 / max(t.dimensions); t.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
root = bpy.data.objects.new('obj_table', None); bpy.context.scene.collection.objects.link(root)
t.name = 'table_body'; t.parent = root
for o in bpy.context.selected_objects: o.select_set(False)
root.select_set(True); t.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('DONE table', tuple(round(x, 3) for x in t.dimensions))
