# Open umbrella: eight-panel dome canopy with scalloped edge (alternating red / white panels), shaft, tip and J handle.
#   Blender -b -P build_umbrella.py -- out.glb
import bpy, bmesh, sys, math
from mathutils import Vector, Matrix
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name, hexc, rough, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*[(int(hexc[i:i+2], 16) / 255) ** 2.2 for i in (0, 2, 4)], 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal; return m
red, white, shaft_m, handle_m = mat('umb_red', 'd8433f', 0.55), mat('umb_white', 'f4f1ea', 0.55), mat('umb_metal', 'b8b8bc', 0.3, 0.8), mat('umb_handle', '6b4426', 0.45)
parts = []
def add(bm, ms, name):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    for m in ms: me.materials.append(m)
    parts.append(o); return o
# canopy: polar grid, height = dome, radius pulled in between ribs for a scalloped edge
NR, NA, PANELS, R, H = 24, 96, 8, 1.0, 0.42
bm = bmesh.new(); rows = []
top = bm.verts.new((0, 0, H))
for i in range(1, NR + 1):
    r = R * i / NR; row = []
    for j in range(NA):
        a = 2 * math.pi * j / NA
        k = (j % (NA // PANELS)) / (NA // PANELS)          # 0 at rib, 0.5 mid panel
        sag = math.sin(math.pi * k) * 0.09 * (r / R) ** 2  # panels sag between ribs
        rr = r * (1 - sag * 0.6)
        z = H * (1 - (r / R) ** 1.8) - sag * 0.6
        row.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
    rows.append(row)
for j in range(NA):
    f = bm.faces.new((top, rows[0][j], rows[0][(j + 1) % NA])); f.material_index = (j // (NA // PANELS)) % 2
for i in range(NR - 1):
    for j in range(NA):
        f = bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][(j + 1) % NA], rows[i][(j + 1) % NA]))
        f.material_index = (j // (NA // PANELS)) % 2
c = add(bm, [red, white], 'canopy')
md = c.modifiers.new('s', 'SOLIDIFY'); md.thickness = 0.012
# shaft, top tip and handle
def cyl(r, h, z0, m, name, seg=16):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, z0 + h / 2), verts=bm.verts); return add(bm, [m], name)
cyl(0.018, 1.15, -0.75, shaft_m, 'shaft')
cyl(0.025, 0.12, H, shaft_m, 'tip')
cu = bpy.data.curves.new('handle', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.035; cu.bevel_resolution = 4
sp = cu.splines.new('BEZIER'); sp.bezier_points.add(3)
for bp, co in zip(sp.bezier_points, [(0, 0, -0.72), (0, 0, -0.95), (0.12, 0, -1.08), (0.24, 0, -0.95)]):
    bp.co = co; bp.handle_left_type = bp.handle_right_type = 'AUTO'
h = bpy.data.objects.new('handle', cu); bpy.context.scene.collection.objects.link(h); cu.materials.append(handle_m)
bpy.context.view_layer.objects.active = h; h.select_set(True); bpy.ops.object.convert(target='MESH'); h = bpy.context.view_layer.objects.active; parts.append(h)
for o in bpy.context.selected_objects: o.select_set(False)
for o in parts:
    bpy.context.view_layer.objects.active = o
    for x in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=x.name)
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active
for p in ob.data.polygons: p.use_smooth = True
ob.rotation_euler = (math.radians(-28), 0, 0)   # canopy tipped towards the viewer so it reads as an umbrella
bpy.ops.object.transform_apply(location=True, rotation=True)
s = 0.27 / max(ob.dimensions); ob.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
vs = [v.co for v in ob.data.vertices]; minz = min(v.z for v in vs)
cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
for v in ob.data.vertices: v.co.x -= cx; v.co.y -= cy; v.co.z -= minz
root = bpy.data.objects.new('obj_umbrella', None); bpy.context.scene.collection.objects.link(root); ob.name = 'umbrella_body'; ob.parent = root
for o in bpy.context.selected_objects: o.select_set(False)
root.select_set(True); ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print('DONE umbrella', tuple(round(x, 3) for x in ob.dimensions), len(ob.data.polygons))
