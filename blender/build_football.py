# Classic black-and-white football: smooth sphere, 12 black pentagon patches, faint seams.
#   Blender -b -P build_football.py -- out.glb
import bpy, bmesh, sys, math
from mathutils import Vector
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name, hexc, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*[(int(hexc[i:i+2], 16) / 255) ** 2.2 for i in (0, 2, 4)], 1)
    b.inputs['Roughness'].default_value = rough; return m
white, black, seam = mat('ball_white', 'f4f2ee', 0.35), mat('ball_black', '1e1e22', 0.35), mat('ball_seam', 'bdbab3', 0.6)
# pentagon centres = icosahedron vertices
ico = bmesh.new(); bmesh.ops.create_icosphere(ico, subdivisions=0, radius=1)
centres = [v.co.normalized() for v in ico.verts]; ico.free()
# hexagon centres = icosahedron face centres; pentagon/hexagon boundaries from the nearest-centre rule
ico = bmesh.new(); bmesh.ops.create_icosphere(ico, subdivisions=0, radius=1)
hexes = [f.calc_center_median().normalized() for f in ico.faces]; ico.free()
bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=6, radius=1)
me = bpy.data.meshes.new('ball'); 
for f in bm.faces:
    c = f.calc_center_median().normalized()
    dp = max(c.dot(p) for p in centres); dh = max(c.dot(h) for h in hexes)
    # a face belongs to the patch whose centre it's angularly closest to (pentagons are a little smaller)
    ap, ah = math.acos(min(1, dp)), math.acos(min(1, dh)) * 1.075
    edge = abs(ap - ah) < 0.022
    others = sorted((c.dot(h) for h in hexes), reverse=True)
    hexedge = math.acos(min(1, others[0])) * 1.0 > 0 and (math.acos(min(1, others[1])) - math.acos(min(1, others[0]))) < 0.035 and ah < ap
    f.material_index = 2 if (edge or hexedge) else (1 if ap < ah else 0)
bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new('football_body', me); bpy.context.scene.collection.objects.link(ob)
for m in (white, black, seam): me.materials.append(m)
for p in me.polygons: p.use_smooth = True
s = 0.115; ob.scale = (s, s, s); ob.location = (0, 0, s)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.transform_apply(location=True, scale=True)
root = bpy.data.objects.new('obj_football', None); bpy.context.scene.collection.objects.link(root); ob.parent = root
for o in bpy.context.selected_objects: o.select_set(False)
root.select_set(True); ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('DONE football', len(me.polygons))
