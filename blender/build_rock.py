# A smooth grey pebble-shaped rock (so it doesn't read as coal): lumpy shape, mottled grey colour.
#   Blender -b -P build_rock.py -- out.glb
import bpy, bmesh, sys, random
from mathutils import Vector, noise
out = sys.argv[sys.argv.index('--') + 1]
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1)
for v in bm.verts:
    p = v.co.copy()
    v.co = p * (1 + 0.22 * noise.noise(p * 1.1) + 0.06 * noise.noise(p * 3.5) + 0.015 * noise.noise(p * 12))
    v.co.x *= 1.25; v.co.y *= 0.95; v.co.z *= 0.62
    if v.co.z < -0.35: v.co.z = -0.35 + (v.co.z + 0.35) * 0.3   # flatter underside so it sits still
me = bpy.data.meshes.new('rock'); bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new('rock_body', me); bpy.context.scene.collection.objects.link(ob)
col = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
for i, v in enumerate(me.vertices):
    n = noise.noise(v.co * 2.5) * 0.6 + noise.noise(v.co * 8.0) * 0.3
    g = 0.30 + 0.09 * n
    if noise.noise(v.co * 14 + Vector((5, 5, 5))) > 0.5: g += 0.12      # pale flecks
    if noise.noise(v.co * 11 + Vector((9, 1, 3))) > 0.55: g -= 0.08     # dark specks
    col.data[i].color = (g * 1.03, g, g * 0.94, 1)
m = bpy.data.materials.new('rock_stone'); m.use_nodes = True; nt = m.node_tree
b = nt.nodes['Principled BSDF']; a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
nt.links.new(a.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.75
me.materials.append(m)
for p in me.polygons: p.use_smooth = True
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
s = 0.24 / max(ob.dimensions); ob.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
minz = min(v.co.z for v in me.vertices)
for v in me.vertices: v.co.z -= minz
root = bpy.data.objects.new('obj_rock', None); bpy.context.scene.collection.objects.link(root); ob.parent = root
for o in bpy.context.selected_objects: o.select_set(False)
root.select_set(True); ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('DONE rock', tuple(round(x, 3) for x in ob.dimensions))
