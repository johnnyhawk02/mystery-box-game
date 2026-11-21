# Monkey for M: Blender's built-in monkey head, coloured warm brown with a light face and dark eyes.
#   Blender -b -P build_monkey.py -- out.glb
import bpy, bmesh, sys, math
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name, hexc, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*[(int(hexc[i:i+2], 16) / 255) ** 2.2 for i in (0, 2, 4)], 1)
    b.inputs['Roughness'].default_value = rough; return m
fur, face, eye = mat('monkey_fur', '8a5a3c', 0.8), mat('monkey_face', 'e3bb8f', 0.6), mat('monkey_eye', '2a2420', 0.25)
bpy.ops.mesh.primitive_monkey_add(size=1)
ob = bpy.context.active_object; me = ob.data
for m in (fur, face, eye): me.materials.append(m)
bm = bmesh.new(); bm.from_mesh(me)
# eyes are the two small separate islands
islands = []
seen = set()
for f in bm.faces:
    if f in seen: continue
    stack, isl = [f], []
    while stack:
        g = stack.pop()
        if g in seen: continue
        seen.add(g); isl.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h not in seen: stack.append(h)
    islands.append(isl)
islands.sort(key=len)
for isl in islands[:-1]:
    for f in isl: f.material_index = 2
for f in islands[-1]:
    c = f.calc_center_median(); n = f.normal
    # light face: front-facing part around the eyes and muzzle, plus the inner ears
    if (n.y < -0.55 and abs(c.x) < 0.6 and -0.75 < c.z < 0.12) or (abs(c.x) > 1.05 and n.y < -0.2):
        f.material_index = 1
bm.to_mesh(me); bm.free()
md = ob.modifiers.new('s', 'SUBSURF'); md.levels = 2; bpy.ops.object.modifier_apply(modifier='s')
for p in me.polygons: p.use_smooth = True
ob.rotation_euler = (math.radians(-8), 0, math.radians(20))   # a friendly tilt, looking front-right
bpy.ops.object.transform_apply(rotation=True)
s = 0.26 / max(ob.dimensions); ob.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
vs = [v.co for v in me.vertices]; minz = min(v.z for v in vs)
cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
for v in me.vertices: v.co.x -= cx; v.co.y -= cy; v.co.z -= minz
root = bpy.data.objects.new('obj_monkey', None); bpy.context.scene.collection.objects.link(root)
ob.name = 'monkey_body'; ob.parent = root
for o in bpy.context.selected_objects: o.select_set(False)
root.select_set(True); ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('DONE monkey', tuple(round(x, 3) for x in ob.dimensions), len(me.polygons))
