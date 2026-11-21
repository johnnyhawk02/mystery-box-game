# X-ray film for X: a hand radiograph (Wikimedia Commons "X-ray of hand 7 09 4.jpg" by Averbone, CC BY 4.0),
# cropped and cleaned (screen labels removed), printed on a glossy, rounded plastic sheet.
#   Blender -b -P build_xray.py -- source.jpg out.glb out_texture.png
import bpy, bmesh, sys, numpy as np
a = sys.argv[sys.argv.index('--') + 1:]; src, out, tex_out = a
bpy.ops.wm.read_factory_settings(use_empty=True)
img = bpy.data.images.load(src); W, H = img.size
px = np.array(img.pixels[:]).reshape(H, W, 4)          # rows from the bottom
r, g, b = px[..., 0], px[..., 1], px[..., 2]
grey = 0.3 * r + 0.59 * g + 0.11 * b
mask = ((b - r) > 0.12) | ((r - b) > 0.18)             # blue scribbles and the orange label
grey[mask] = 0.0
# crop to the film area (image rows count from the bottom)
x0, x1 = 150, 1075; ytop, ybot = 205, 1400              # in top-down pixel coords
crop = grey[H - ybot:H - ytop, x0:x1]
crop = np.clip((crop - 0.08) / 0.85, 0, 1) ** 1.1      # deeper blacks, clean whites
# soft dark border like a film edge
h, w = crop.shape
yy, xx = np.mgrid[0:h, 0:w]
edge = np.minimum.reduce([xx, w - 1 - xx, yy, h - 1 - yy]) / 40.0
crop *= np.clip(edge, 0, 1)
tint = np.array([0.86, 0.93, 1.0])                     # faint blue of x-ray film
outpx = np.ones((h, w, 4)); outpx[..., :3] = crop[..., None] * tint + 0.02
tex = bpy.data.images.new('xray_hand', w, h); tex.pixels[:] = outpx.ravel()
tex.filepath_raw = tex_out; tex.file_format = 'PNG'; tex.save()
# glossy film sheet
aspect = h / w; SW = 1.0; SH = SW * aspect; T = 0.012
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(SW, SH, T), verts=bm.verts)
me = bpy.data.meshes.new('film'); bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new('xray_body', me); bpy.context.scene.collection.objects.link(ob)
uv = me.uv_layers.new(name='UVMap')
for loop in me.loops:
    co = me.vertices[loop.vertex_index].co
    uv.data[loop.index].uv = (co.x / SW + 0.5, co.y / SH + 0.5)
m = bpy.data.materials.new('xray_film'); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = tex; nt.links.new(tn.outputs['Color'], bs.inputs['Base Color'])
bs.inputs['Roughness'].default_value = 0.12
me.materials.append(m)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
md = ob.modifiers.new('b', 'BEVEL'); md.width = 0.05; md.segments = 6; md.affect = 'EDGES'
bpy.ops.object.modifier_apply(modifier='b')
s = 0.27 / max(SW, SH); ob.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
minz = min(v.co.z for v in me.vertices)
for v in me.vertices: v.co.z -= minz
root = bpy.data.objects.new('obj_xray', None); bpy.context.scene.collection.objects.link(root); ob.parent = root
for o in bpy.context.selected_objects: o.select_set(False)
root.select_set(True); ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=85)
print('DONE xray', w, h, tuple(round(x, 3) for x in ob.dimensions))
