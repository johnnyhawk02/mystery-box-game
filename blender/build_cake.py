# Birthday cake: round sponge with white icing, soft pink drips and top border, sprinkles, three candles with flames.
#   Blender -b -P build_cake.py -- out.glb
import bpy, bmesh, sys, math, random
from mathutils import Vector
out = sys.argv[sys.argv.index('--') + 1]
random.seed(3)
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name, hexc, rough, emit=0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    c = [(int(hexc[i:i+2], 16) / 255) ** 2.2 for i in (0, 2, 4)]
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*c, 1); b.inputs['Emission Strength'].default_value = emit
    return m
icing, pink, plate = mat('cake_icing', 'fbf6ee', 0.45), mat('cake_pink', 'f2a7b8', 0.4), mat('cake_plate', 'f3f1ec', 0.25)
sprk = [mat('spr_%d' % i, h, 0.4) for i, h in enumerate(['e8505b', '4f9be8', 'f5c542', '61c27a', 'b57be0'])]
cand = [mat('candle_%d' % i, h, 0.5) for i, h in enumerate(['7fb3e8', 'f29bb3', 'f5d06a'])]
flame = mat('flame', 'ffb43a', 0.3, emit=6); wick = mat('wick', '2b2b2b', 0.8)
parts = []
def add(bm, m, name):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(m); parts.append(o); return o
def cyl(r, h, z, m, seg=64, r2=None, name='c', bevel=0.0):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, z + h / 2), verts=bm.verts)
    o = add(bm, m, name)
    if bevel:
        md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 4; md.limit_method = 'ANGLE'
    return o
R, H = 1.0, 0.75
cyl(1.22, 0.05, 0, plate, name='plate', bevel=0.02)
cyl(R, H, 0.05, icing, name='cake', bevel=0.08)
# pink drips around the top edge
for i in range(28):
    a = 2 * math.pi * i / 28 + random.uniform(-0.04, 0.04); L = random.uniform(0.12, 0.32)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=10, radius=0.07)
    bmesh.ops.scale(bm, vec=(1, 0.55, L / 0.07 * 0.5), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(math.cos(a) * (R + 0.005), math.sin(a) * (R + 0.005), 0.05 + H - L * 0.45), verts=bm.verts)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(math.cos(a) * R, math.sin(a) * R, 0), matrix=__import__('mathutils').Matrix.Rotation(a, 3, 'Z') @ __import__('mathutils').Matrix.Rotation(0, 3, 'Z'))
    add(bm, pink, 'drip')

# piped border of little blobs on top, and round the base
for ring_r, z, n, m in [(0.86, 0.05 + H + 0.02, 22, pink), (R + 0.03, 0.06, 30, icing)]:
    for i in range(n):
        a = 2 * math.pi * i / n
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.075)
        bmesh.ops.translate(bm, vec=(math.cos(a) * ring_r, math.sin(a) * ring_r, z), verts=bm.verts)
        add(bm, m, 'blob')
# sprinkles on top
for i in range(70):
    rr = math.sqrt(random.random()) * 0.72; a = random.uniform(0, 2 * math.pi)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.016, radius2=0.016, depth=0.07)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(random.uniform(0, 6.3), 3, 'Z'))
    bmesh.ops.translate(bm, vec=(math.cos(a) * rr, math.sin(a) * rr, 0.05 + H + 0.012), verts=bm.verts)
    add(bm, random.choice(sprk), 'sprinkle')
# three candles with flames
for k, (x, y) in enumerate([(-0.32, 0.12), (0.0, -0.18), (0.32, 0.14)]):
    c = cyl(0.065, 0.5, 0.05 + H, cand[k], seg=20, name='candle')
    c.location = (x, y, 0)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.008, radius2=0.008, depth=0.05)
    bmesh.ops.translate(bm, vec=(x, y, 0.05 + H + 0.5 + 0.025), verts=bm.verts); add(bm, wick, 'wick')
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=12, radius=0.06)
    for v in bm.verts:
        if v.co.z > 0: v.co.z *= 2.2; v.co.x *= 1 - v.co.z * 4; v.co.y *= 1 - v.co.z * 4
    bmesh.ops.translate(bm, vec=(x, y, 0.05 + H + 0.5 + 0.08), verts=bm.verts); add(bm, flame, 'flame')
for o in bpy.context.selected_objects: o.select_set(False)
for o in parts:
    bpy.context.view_layer.objects.active = o
    for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[1]
bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active
for p in ob.data.polygons: p.use_smooth = True
s = 0.26 / max(ob.dimensions); ob.scale = (s, s, s); bpy.ops.object.transform_apply(location=True, scale=True)
minz = min(v.co.z for v in ob.data.vertices)
for v in ob.data.vertices: v.co.z -= minz
root = bpy.data.objects.new('obj_cake', None); bpy.context.scene.collection.objects.link(root); ob.name = 'cake_body'; ob.parent = root
for o in bpy.context.selected_objects: o.select_set(False)
root.select_set(True); ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('DONE cake', tuple(round(x, 3) for x in ob.dimensions), len(ob.data.polygons))
