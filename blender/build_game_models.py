# Mystery box letter game, v3: game-ready models.
#   Blender -b -P build_game_models.py -- [--render] [--export]
# Outputs (next to this script):
#   mystery_box.glb      box rig with actions 'open', 'close', 'hint'; node 'reveal_point' marks where to show the object
#   alphabet_board.glb   board with tiles 'tile_A'..'tile_Z' and empty nodes 'slot_A'..'slot_Z' (drop targets)
#   objects/<name>.glb   one draggable object each, origin at its bottom centre; objects_all.glb has them all
import bpy, bmesh, math, os, sys
from mathutils import Vector
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
PI = math.pi
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; col = scene.collection

MATS = {}
def mat(name, hexc, rough=0.6):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    c = tuple((int(hexc[i:i+2], 16) / 255) ** 2.2 for i in (0, 2, 4))
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = rough
    MATS[name] = m; return m

# calm, low-contrast palette
C = dict(box=mat('BoxSage', '9fbfa8'), boxdark=mat('BoxSageDark', '86a991'), panel=mat('BoxPanel', 'c3d6c6'),
         lining=mat('BoxLining', 'b9b2cf', 0.85), lid=mat('LidCream', 'f1ead9'), lidpanel=mat('LidPanel', 'e4dcc8'),
         emblem=mat('EmblemSand', 'e9cf96'), ink=mat('Ink', '45506a'), metal=mat('Hinge', 'b9b4a8', 0.35),
         board=mat('BoardWood', 'e3d3b5', 0.7), rim=mat('BoardRim', 'cdb894', 0.6), dip=mat('Dip', 'e6dccb', 0.8))
TILE = [mat('TileSage', 'bfd4bd'), mat('TileSky', 'bccfe0'), mat('TileSand', 'e8d3a8'), mat('TileBlush', 'e6c4ba')]

def link(ob): col.objects.link(ob); return ob
def mesh_obj(name, bm, m, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    for x in (m if isinstance(m, list) else [m]): me.materials.append(x)
    for p in me.polygons: p.use_smooth = smooth
    return ob
def empty(name, loc=(0, 0, 0), size=0.1):
    e = link(bpy.data.objects.new(name, None)); e.location = loc; e.empty_display_size = size; return e
def add_mod(ob, kind, **kw):
    md = ob.modifiers.new(kind, kind)
    for k, v in kw.items(): setattr(md, k, v)
    return md
def select_only(*obs):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
def apply_all(ob):
    select_only(ob)
    for md in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
def bevel(ob, w, seg=3, angle=True):
    kw = dict(width=w, segments=seg)
    if angle: kw['limit_method'] = 'ANGLE'
    add_mod(ob, 'BEVEL', **kw); apply_all(ob)
    for p in ob.data.polygons: p.use_smooth = True
    return ob
def box_bm(sx, sy, sz, at=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts); bmesh.ops.translate(bm, vec=at, verts=bm.verts); return bm
def cyl_bm(r, d, seg=40, r2=None, at=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=d)
    bmesh.ops.translate(bm, vec=at, verts=bm.verts); return bm
def sphere_bm(r, scale=(1, 1, 1), at=(0, 0, 0), u=32, v=20):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts); bmesh.ops.translate(bm, vec=at, verts=bm.verts); return bm
def text_obj(name, s, size, depth, m, align_y='CENTER'):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = s; cu.size = size; cu.extrude = depth
    cu.align_x = 'CENTER'; cu.align_y = align_y; cu.bevel_depth = depth * 0.4; cu.bevel_resolution = 2
    ob = link(bpy.data.objects.new(name, cu)); cu.materials.append(m)
    select_only(ob); bpy.ops.object.convert(target='MESH')
    ob = bpy.context.view_layer.objects.active; ob.name = name; return ob
def boolean(ob, cutter, op='DIFFERENCE'):
    add_mod(ob, 'BOOLEAN', object=cutter, operation=op, solver='EXACT'); apply_all(ob); bpy.data.objects.remove(cutter)
def join(name, obs):
    select_only(*obs); bpy.ops.object.join(); o = bpy.context.view_layer.objects.active; o.name = name; o.data.name = name; return o
def parent_keep(ob, par):
    bpy.context.view_layer.update()
    mw = ob.matrix_world.copy(); ob.parent = par; ob.matrix_world = mw

# =====================================================================
# MYSTERY BOX  (built at the origin; placed in the scene later)
# =====================================================================
W, D, H, T = 0.8, 0.8, 0.56, 0.05
FOOT = 0.05
parts = []
# shell, open on top
bm = box_bm(W, D, H, at=(0, 0, FOOT + H/2))
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.9], context='FACES')
shell = mesh_obj('box_shell', bm, [C['box'], C['lining']])
add_mod(shell, 'SOLIDIFY', thickness=T, offset=-1, material_offset=1, use_rim=True); apply_all(shell)
for p in shell.data.polygons:
    c = p.center
    p.material_index = 1 if (abs(c.x) < W/2 - T*0.5 and abs(c.y) < D/2 - T*0.5 and c.z > FOOT + T*0.5) else 0
bevel(shell, 0.018)
parts.append(shell)
# corner posts
for sx in (-1, 1):
    for sy in (-1, 1):
        p = mesh_obj('post', cyl_bm(0.045, H + 0.02, 24, at=(sx*(W/2 - 0.01), sy*(D/2 - 0.01), FOOT + H/2 - 0.01)), C['boxdark'])
        bevel(p, 0.015, angle=False); parts.append(p)
        f = mesh_obj('foot', sphere_bm(0.055, (1, 1, 0.8), at=(sx*(W/2 - 0.05), sy*(D/2 - 0.05), FOOT*0.8), u=20, v=12), C['boxdark'])
        parts.append(f)
# raised inset panel on each side, a rail along the top edge
PW, PH = W - 0.2, H - 0.18
for name, rot, loc in [('front', (PI/2, 0, 0), (0, -D/2, 0)), ('back', (PI/2, 0, PI), (0, D/2, 0)),
                       ('right', (PI/2, 0, PI/2), (W/2, 0, 0)), ('left', (PI/2, 0, -PI/2), (-W/2, 0, 0))]:
    pn = mesh_obj('panel_' + name, box_bm(PW, PH, 0.02), C['panel']); bevel(pn, 0.008, 2, angle=False)
    pn.rotation_euler = rot; pn.location = Vector(loc) * (1 + 0.012 / (D/2)) + Vector((0, 0, FOOT + H/2 - 0.02))
    parts.append(pn)
# top rail
rail = mesh_obj('rail', box_bm(W + 0.03, D + 0.03, 0.04, at=(0, 0, FOOT + H - 0.02)), C['boxdark'])
inner = mesh_obj('rail_cut', box_bm(W - 2*T, D - 2*T, 0.2, at=(0, 0, FOOT + H)), C['boxdark'])
boolean(rail, inner); bevel(rail, 0.012, 2); parts.append(rail)
# front emblem: soft sand disc with an engraved-looking question mark
em = mesh_obj('emblem', cyl_bm(0.12, 0.02, 48), C['emblem']); bevel(em, 0.008, 2, angle=False)
em.rotation_euler = (PI/2, 0, 0); em.location = (0, -D/2 - 0.03, FOOT + H/2 - 0.02); parts.append(em)
q = text_obj('emblem_q', '?', 0.17, 0.006, C['ink']); q.rotation_euler = (PI/2, 0, 0)
q.location = (0, -D/2 - 0.042, FOOT + H/2 - 0.02); parts.append(q)
# hinges (stay with the body)
for hx in (-0.22, 0.22):
    hg = mesh_obj('hinge', cyl_bm(0.026, 0.13, 20), C['metal']); bevel(hg, 0.006, 2, angle=False)
    hg.rotation_euler = (0, PI/2, 0); hg.location = (hx, D/2 + 0.03, FOOT + H + 0.005); parts.append(hg)
body = join('box_body', parts)

# lid: overhanging slab with lip, inset top panel and a round knob
LZ = FOOT + H + 0.005
lid_parts = []
slab = mesh_obj('lid_slab', box_bm(W + 0.07, D + 0.07, 0.06, at=(0, 0, LZ + 0.03)), C['lid']); bevel(slab, 0.025, 4)
lid_parts.append(slab)
lip = mesh_obj('lid_lip', box_bm(W - 2*T - 0.01, D - 2*T - 0.01, 0.04, at=(0, 0, LZ - 0.015)), C['lidpanel']); bevel(lip, 0.01, 2)
lid_parts.append(lip)
tp = mesh_obj('lid_panel', box_bm(W - 0.18, D - 0.18, 0.016, at=(0, 0, LZ + 0.064)), C['lidpanel']); bevel(tp, 0.007, 2, angle=False)
lid_parts.append(tp)
# felt door: a square hole in the lid closed by four soft felt flaps (a cross-shaped cut), like the
# classroom toy. Each flap is its own node, hinged at the hole's edge, so the game can bend them open.
S = 0.42; FZ = LZ + 0.058
for prt in list(lid_parts):
    boolean(prt, mesh_obj('cut', box_bm(S, S, 0.6, at=(0, 0, LZ)), C['lid']))
ring = mesh_obj('felt_ring', box_bm(S + 0.05, S + 0.05, 0.05, at=(0, 0, LZ + 0.045)), C['boxdark'])
boolean(ring, mesh_obj('cut', box_bm(S, S, 0.6, at=(0, 0, LZ)), C['lid'])); bevel(ring, 0.01, 2); lid_parts.append(ring)
C['felt'] = mat('Felt', '9a8fb8', 1.0)
FLAPS = []
for k in range(4):
    bm = bmesh.new(); g = 0.006
    vs = [bm.verts.new(v) for v in [(-S/2 + g, 0, 0), (S/2 - g, 0, 0), (0, -S/2 + g*1.4, 0)]]   # hinge on the local x axis
    bm.faces.new(vs)
    fl = mesh_obj('flap_%d' % k, bm, C['felt'])
    add_mod(fl, 'SOLIDIFY', thickness=0.012, offset=0); apply_all(fl); bevel(fl, 0.004, 2)
    ang = k * PI / 2
    fl.rotation_euler = (0, 0, ang)
    fl.location = (-math.sin(ang) * S/2, math.cos(ang) * S/2, FZ)
    FLAPS.append(fl)
lid = join('box_lid', lid_parts)
for fl in FLAPS: parent_keep(fl, lid)

# rig
arm = bpy.data.armatures.new('MysteryBoxRig'); rig = link(bpy.data.objects.new('MysteryBox', arm))
select_only(rig); bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
r = eb.new('root'); r.head = (0, 0, 0); r.tail = (0, 0.3, 0)
b = eb.new('body'); b.head = (0, 0, 0); b.tail = (0, 0, 0.4); b.parent = r
l = eb.new('lid'); l.head = (0, D/2 + 0.03, LZ); l.tail = (0, -D/2, LZ); l.parent = b
bpy.ops.object.mode_set(mode='OBJECT'); bpy.context.view_layer.update()
def bone_parent(ob, bone):
    mw = ob.matrix_world.copy(); ob.parent = rig; ob.parent_type = 'BONE'; ob.parent_bone = bone; ob.matrix_world = mw
bone_parent(body, 'body'); bone_parent(lid, 'lid')
reveal = empty('reveal_point', (0, 0, FOOT + H + 0.42), 0.15); parent_keep(reveal, rig)

P = rig.pose.bones
for pb in P: pb.rotation_mode = 'XYZ'
scene.render.fps = 30
rig.animation_data_create()
def fcurves(act):
    try: return list(act.fcurves)
    except AttributeError: return [fc for ly in act.layers for st in ly.strips for cb in st.channelbags for fc in cb.fcurves]
def make_action(name, keys):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    rig.animation_data.action = act
    for bone, f, rot, scl in keys:
        if rot is not None: P[bone].rotation_euler = rot; P[bone].keyframe_insert('rotation_euler', frame=f)
        if scl is not None: P[bone].scale = scl; P[bone].keyframe_insert('scale', frame=f)
    for fc in fcurves(act):
        for kp in fc.keyframe_points: kp.interpolation = 'SINE'; kp.easing = 'EASE_IN_OUT'
    for pb in P: pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
    return act
OPEN = 1.85
A_open = make_action('open', [('lid', 1, (0, 0, 0), None), ('lid', 36, (OPEN, 0, 0), None)])
A_close = make_action('close', [('lid', 1, (OPEN, 0, 0), None), ('lid', 30, (0, 0, 0), None)])
# hint: a small, slow lift of the lid and a gentle breath of the box, to invite a tap
A_hint = make_action('hint', [('lid', 1, (0, 0, 0), None), ('lid', 18, (0.12, 0, 0), None), ('lid', 36, (0, 0, 0), None),
                              ('body', 1, None, (1, 1, 1)), ('body', 18, None, (1.02, 1.02, 0.985)), ('body', 36, None, (1, 1, 1))])
rig.animation_data.action = A_open
BOX_OBJS = [rig, body, lid, reveal] + FLAPS

# =====================================================================
# ALPHABET BOARD
# =====================================================================
COLS, ROWS, CW, CH, GAP = 7, 4, 0.42, 0.52, 0.03   # 4 rows: 7, 7, 6, 6
ROW_STARTS = [0, 7, 14, 20]
BW = COLS*CW + 0.22; BD = ROWS*CH + 0.22; BT = 0.07
board_root = empty('AlphabetBoard', (0, 0, 0), 0.3)
base = mesh_obj('board_base', box_bm(BW, BD, BT, at=(0, 0, BT/2)), C['board']); bevel(base, 0.02, 3)
rimo = mesh_obj('board_rim', box_bm(BW + 0.06, BD + 0.06, 0.035, at=(0, 0, BT + 0.0175)), C['rim'])
rimi = mesh_obj('cut', box_bm(BW - 0.08, BD - 0.08, 0.2, at=(0, 0, BT)), C['rim'])
boolean(rimo, rimi); bevel(rimo, 0.012, 2)
parent_keep(base, board_root); parent_keep(rimo, board_root)
BOARD_OBJS = [board_root, base, rimo]
SLOTS = {}
TILE_T = 0.025; TOP = BT + TILE_T
for i, ch in enumerate('ABCDEFGHIJKLMNOPQRSTUVWXYZ'):
    row = max(r for r in range(ROWS) if i >= ROW_STARTS[r]); c = i - ROW_STARTS[row]
    cx = c + (1 if row >= 2 else 0)   # the 6-letter rows sit to the right, leaving room for the pad bottom-left
    x = -BW/2 + 0.11 + CW*(cx + 0.5); y = BD/2 - 0.11 - CH*(row + 0.5)
    t = mesh_obj('tile_' + ch, box_bm(CW - GAP, CH - GAP, TILE_T, at=(0, 0, TILE_T/2)), [TILE[i % 4], C['dip']])
    t.location = (x, y, BT)
    cut = mesh_obj('cut', cyl_bm(0.14, 0.1, 48, at=(x, y + 0.085, BT + TILE_T + 0.03)), C['dip'])
    cut.location -= Vector((x, y, BT)) * 0  # world-space cutter
    bpy.context.view_layer.update()
    boolean(t, cut); bevel(t, 0.01, 2)
    for p in t.data.polygons:
        if p.center.z < TILE_T - 0.004 and p.normal.z > -0.5 and math.hypot(p.center.x, p.center.y - 0.085) < 0.145: p.material_index = 1
    t2 = t; parent_keep(t2, board_root)
    # capitals and small letters are separate nodes so the game can switch between them
    for nm, txt in (('upper_', ch), ('lower_', ch.lower())):
        lt = text_obj(nm + ch, txt, 0.19, 0.006, C['ink'], 'BOTTOM_BASELINE')  # shared baseline, so g/j/p/q/y hang below
        lt.location = (x, y - 0.19, TOP + 0.001)
        parent_keep(lt, board_root); BOARD_OBJS.append(lt)
    s = empty('slot_' + ch, (x, y + 0.085, TOP - 0.025), 0.12); parent_keep(s, board_root)
    SLOTS[ch] = s; BOARD_OBJS += [t2, s]
# note: joining moved origin to the tile's origin; that's fine

# =====================================================================
# OBJECTS (each built at origin, bottom at z=0)
# =====================================================================
O = dict(apple=mat('Apple', 'c8695c', 0.4), apple2=mat('AppleBlush', 'd88a62', 0.45), stem=mat('Stem', '7a5a3e', 0.7),
         leaf=mat('Leaf', '86ab72', 0.55), white=mat('SoftWhite', 'f4f0e8', 0.5),
         b1=mat('BallBlue', '7f9fc6', 0.4), b2=mat('BallSand', 'e8c37f', 0.4), b3=mat('BallRose', 'd99a91', 0.4),
         cup=mat('Cup', 'd9ab72', 0.4), cupin=mat('CupInside', 'f1e6d0', 0.4), tea=mat('Tea', 'a9825c', 0.2),
         duck=mat('Duck', 'eed27a', 0.5), beak=mat('Beak', 'e09a5e', 0.45), eye=mat('Eye', '3a3f4f', 0.3),
         egg=mat('Egg', 'efe3cc', 0.55), speck=mat('Speck', 'c9b393', 0.6),
         fish=mat('Fish', '8fb6c9', 0.45), fin=mat('Fin', 'a7c7b8', 0.5), stripe=mat('Stripe', 'f0e2c2', 0.5))
OBJECTS = {}
def finish(name, letter, obs):
    root = empty('obj_' + name, (0, 0, 0), 0.1)
    root['letter'] = letter
    for o in obs: parent_keep(o, root)
    OBJECTS[name] = (root, letter); return root

# --- apple ---
bm = sphere_bm(0.12, u=40, v=24)
for v in bm.verts:
    v.co.z *= 0.9; rr = math.hypot(v.co.x, v.co.y)
    v.co.z -= 0.04*math.exp(-(rr/0.04)**2)*(1 if v.co.z > 0 else -0.5)
    v.co.x *= 1 + 0.04*math.sin(5*math.atan2(v.co.y, v.co.x))*(rr/0.12)  # soft lobes
    v.co.y *= 1 + 0.04*math.sin(5*math.atan2(v.co.y, v.co.x))*(rr/0.12)
bmesh.ops.translate(bm, vec=(0, 0, 0.108), verts=bm.verts)
ap = mesh_obj('apple_body', bm, [O['apple'], O['apple2']])
st = mesh_obj('apple_stem', cyl_bm(0.009, 0.07, 10, 0.006, at=(0, 0, 0.035)), O['stem']); st.location = (0, 0, 0.18); st.rotation_euler = (0, 0.2, 0)
lf = []
for k, (ang, tilt) in enumerate([(0.3, -0.6), (2.6, 0.5)]):
    bm = sphere_bm(0.05, (1, 0.42, 0.12), at=(0.05, 0, 0))
    for v in bm.verts: v.co.z += 0.6*(v.co.x - 0.05)**2 * 8  # curl
    o = mesh_obj('apple_leaf', bm, O['leaf']); o.location = (0, 0, 0.205 - 0.008*k); o.rotation_euler = (0, tilt, ang); lf.append(o)
cx = mesh_obj('apple_calyx', cyl_bm(0.018, 0.01, 5, 0.01, at=(0, 0, 0.02)), O['stem'])
finish('apple', 'A', [ap, st, cx] + lf)

# --- ball: six-panel beach-style ball with caps ---
bm = sphere_bm(0.115, u=48, v=28)
ball = mesh_obj('ball_body', bm, [O['b1'], O['b2'], O['b3'], O['white']])
for p in ball.data.polygons:
    c = p.center
    if abs(c.z) > 0.1: p.material_index = 3
    else: p.material_index = int(((math.atan2(c.y, c.x) + PI) / (2*PI)) * 6) % 3
cap = mesh_obj('ball_valve', cyl_bm(0.012, 0.012, 16, at=(0, 0, 0.116)), O['white'])
cap.parent = ball
ball.rotation_euler = (0.35, 0.2, 0); ball.location = (0, 0, 0.115)
bpy.context.view_layer.update()
finish('ball', 'B', [ball, cap])

# --- cup with saucer ---
bm = cyl_bm(0.075, 0.15, 40, 0.09, at=(0, 0, 0.1))
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.9], context='FACES')
cup = mesh_obj('cup_body', bm, [O['cup'], O['cupin']])
add_mod(cup, 'SOLIDIFY', thickness=0.01, material_offset=1); apply_all(cup); bevel(cup, 0.004, 2)
tea = mesh_obj('cup_tea', cyl_bm(0.08, 0.004, 40, at=(0, 0, 0.15)), O['tea'])
cu = bpy.data.curves.new('cup_handle', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.012; cu.bevel_resolution = 3
sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
for bp, co in zip(sp.bezier_points, [(0.083, 0, 0.15), (0.15, 0, 0.11), (0.078, 0, 0.06)]):
    bp.co = co; bp.handle_left_type = bp.handle_right_type = 'AUTO'
hd = link(bpy.data.objects.new('cup_handle', cu)); cu.materials.append(O['cup'])
select_only(hd); bpy.ops.object.convert(target='MESH'); hd = bpy.context.view_layer.objects.active
sc = mesh_obj('cup_saucer', cyl_bm(0.08, 0.012, 48, 0.13, at=(0, 0, 0.012)), O['white']); bevel(sc, 0.004, 2, angle=False)
cup.location.z += 0.0
finish('cup', 'C', [cup, tea, hd, sc])

# --- duck (bath-toy style) ---
bm = sphere_bm(0.1, (1.25, 0.95, 0.72), at=(0, 0, 0.075))
for v in bm.verts:
    if v.co.x < -0.05: v.co.z += (-(v.co.x + 0.05))**1.5 * 1.2  # tail lifts
    if v.co.z < 0.02: v.co.z = 0.02 - (0.02 - v.co.z) * 0.3          # flatter bottom
bmesh.ops.translate(bm, vec=(0, 0, -0.01), verts=bm.verts)
db = mesh_obj('duck_body', bm, O['duck'])
hd2 = mesh_obj('duck_head', sphere_bm(0.068, at=(0.07, 0, 0.175)), O['duck'])
bk = mesh_obj('duck_beak', sphere_bm(0.04, (1.1, 0.75, 0.32), at=(0.135, 0, 0.165)), O['beak'])
eyes = []
for sy in (-1, 1):
    e = mesh_obj('duck_eye', sphere_bm(0.011, at=(0.115, sy*0.04, 0.195), u=12, v=8), O['eye']); eyes.append(e)
    w = mesh_obj('duck_wing', sphere_bm(0.06, (1.1, 0.3, 0.55), at=(-0.01, sy*0.088, 0.085)), O['duck']); w.rotation_euler = (sy*0.1, -0.25, 0); eyes.append(w)
finish('duck', 'D', [db, hd2, bk] + eyes)

# --- egg with soft speckles ---
bm = sphere_bm(0.075, u=32, v=24)
for v in bm.verts:
    z = v.co.z / 0.075
    k = 1.0 - 0.18 * max(z, 0)  # narrower top
    v.co.x *= k; v.co.y *= k; v.co.z *= 1.32
bmesh.ops.translate(bm, vec=(0, 0, 0.099), verts=bm.verts)
eg = mesh_obj('egg_shell', bm, O['egg'])
import random; random.seed(4)
specks = []
for i in range(14):
    th = random.uniform(0, 2*PI); z = random.uniform(0.04, 0.17)
    rad = 0.073 * math.sqrt(max(0.05, 1 - ((z - 0.099)/0.099)**2)) * (1.0 - 0.18*max((z-0.099)/0.099, 0))
    s = mesh_obj('egg_speck', sphere_bm(0.007, (1, 1, 0.3), u=8, v=6), O['speck'])
    s.location = (rad*math.cos(th), rad*math.sin(th), z)
    s.rotation_euler = Vector((math.cos(th), math.sin(th), 0)).to_track_quat('Z', 'Y').to_euler()
    specks.append(s)
finish('egg', 'E', [eg] + specks)

# --- fish (toy style, upright, sitting on its belly) ---
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=32, radius=0.1)
bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(PI/2, 3, 'Y'))  # rings run across the body, so stripes are clean
bmesh.ops.scale(bm, vec=(1.25, 0.45, 0.8), verts=bm.verts)
for v in bm.verts:
    if v.co.x < 0: v.co.y *= 1 + v.co.x*3; v.co.z *= 1 + v.co.x*2.2  # taper to tail
bmesh.ops.translate(bm, vec=(0.02, 0, 0.082), verts=bm.verts)
fb = mesh_obj('fish_body', bm, [O['fish'], O['stripe']])
for p in fb.data.polygons:
    if -0.02 < p.center.x < 0.01 or 0.06 < p.center.x < 0.085: p.material_index = 1
def fin(name, pts, thick, loc, rot):
    bm = bmesh.new(); vs = [bm.verts.new((x, 0, z)) for x, z in pts]; bm.faces.new(vs)
    o = mesh_obj(name, bm, O['fin']); add_mod(o, 'SOLIDIFY', thickness=thick, offset=0); add_mod(o, 'SUBSURF', levels=2)
    apply_all(o); o.location = loc; o.rotation_euler = rot
    for p in o.data.polygons: p.use_smooth = True
    return o
tail = fin('fish_tail', [(0, 0), (-0.09, 0.075), (-0.07, 0), (-0.09, -0.075)], 0.012, (-0.075, 0, 0.082), (0, 0, 0))
dors = fin('fish_dorsal', [(0.05, 0), (-0.02, 0.06), (-0.06, 0)], 0.01, (0.0, 0, 0.145), (0, 0, 0))
side = []
for sy in (-1, 1):
    side.append(fin('fish_side', [(0, 0), (-0.05, 0.025), (-0.04, -0.02)], 0.008, (0.05, sy*0.04, 0.06), (sy*0.9, 0, 0)))
    side.append(mesh_obj('fish_eye', sphere_bm(0.012, at=(0.09, sy*0.032, 0.1), u=12, v=8), O['eye']))
    side.append(mesh_obj('fish_eye_white', sphere_bm(0.018, (1, 0.5, 1), at=(0.088, sy*0.027, 0.1), u=12, v=8), O['white']))
finish('fish', 'F', [fb, tail, dors] + side)

# =====================================================================
# LAYOUT for previews: box on the left, board on the right, objects in a row
# =====================================================================
BOX_AT = Vector((-2.75, 0.15, 0)); BOARD_AT = Vector((0.0, 0.15, 0))
rig.location = BOX_AT; board_root.location = BOARD_AT
bpy.context.view_layer.update()
SHELF = {}
for k, name in enumerate(OBJECTS):
    SHELF[name] = Vector((-1.1 + k*0.5, -2.6, 0))
    OBJECTS[name][0].location = SHELF[name]

if '--export' not in ARGS: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'mystery_box_game.blend'))

# ================= RENDER =================
def setup_render():
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Base Contrast'
    try: scene.eevee.taa_render_samples = 64
    except Exception: pass
    world = bpy.data.worlds.new('World'); scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.86, 0.84, 0.8, 1); bg.inputs['Strength'].default_value = 0.5
    def light(name, loc, energy, size, color=(1, 1, 1), target=(-0.5, 0, 0.2)):
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = color; ld.size = size
        ob = link(bpy.data.objects.new(name, ld)); ob.location = loc
        ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    light('Key', (-2.5, -4.0, 4.5), 330, 6, (1, 0.96, 0.9))
    light('Fill', (3.5, -3.0, 2.5), 110, 6, (0.92, 0.95, 1))
    light('Back', (0, 4, 3), 150, 5)
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=14)
    mesh_obj('Ground', bm, mat('Ground', 'ddd5c7', 0.9))
def render(path, cam_loc, target, lens=50, res=(1200, 1200)):
    scene.render.resolution_x, scene.render.resolution_y = res
    cd = bpy.data.cameras.new('Cam'); cam = link(bpy.data.objects.new('Cam', cd)); cam.location = cam_loc
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat('-Z', 'Y').to_euler()
    cd.lens = lens; scene.camera = cam; scene.render.filepath = path
    bpy.ops.render.render(write_still=True); bpy.data.objects.remove(cam)
def set_lid(a):
    rig.animation_data.action = None; P['lid'].rotation_euler = (a, 0, 0); bpy.context.view_layer.update()
def hide_objects(except_=()):
    for name, (root, _) in OBJECTS.items():
        for o in [root] + list(root.children_recursive): o.hide_render = name not in except_

if '--render' in ARGS:
    for o in bpy.data.objects:
        if o.name.startswith('lower_'): o.hide_render = True
    setup_render()
    out = os.path.join(HERE, 'renders'); os.makedirs(out, exist_ok=True)
    # 1. game screen: closed box, empty board
    hide_objects(); set_lid(0)
    game = ((-0.55, -3.7, 3.7), (-0.5, 0.2, 0.15))
    render(os.path.join(out, '1_game_start.png'), *game, lens=30, res=(1800, 1000))
    # 2. tap: box open, the apple shown above it
    set_lid(OPEN); hide_objects(('apple',))
    OBJECTS['apple'][0].location = reveal.matrix_world.translation - Vector((0, 0, 0.1))
    render(os.path.join(out, '2_game_reveal.png'), *game, lens=30, res=(1800, 1000))
    # 3. placed: apple, ball, cup, duck on their letters, box closed again
    set_lid(0); hide_objects(('apple', 'ball', 'cup', 'duck'))
    for n in ('apple', 'ball', 'cup', 'duck'):
        OBJECTS[n][0].location = SLOTS[OBJECTS[n][1]].matrix_world.translation
    render(os.path.join(out, '3_game_placed.png'), *game, lens=30, res=(1800, 1000))
    # 4. close-ups of the box
    hide_objects(); set_lid(0)
    render(os.path.join(out, '4_box_closed.png'), BOX_AT + Vector((0.9, -1.9, 1.2)), BOX_AT + Vector((0, 0, 0.38)), lens=50)
    render(os.path.join(out, '4b_box_top.png'), BOX_AT + Vector((0.0, -0.5, 2.0)), BOX_AT + Vector((0, 0, 0.6)), lens=50)
    set_lid(OPEN); hide_objects(('apple',)); OBJECTS['apple'][0].location = reveal.matrix_world.translation - Vector((0, 0, 0.1))
    render(os.path.join(out, '5_box_open.png'), BOX_AT + Vector((0.7, -1.9, 1.5)), BOX_AT + Vector((0, 0, 0.5)), lens=48)
    # 6. board from above
    set_lid(0); hide_objects(('apple', 'ball', 'cup', 'duck'))
    for n in ('apple', 'ball', 'cup', 'duck'):
        OBJECTS[n][0].location = SLOTS[OBJECTS[n][1]].matrix_world.translation
    render(os.path.join(out, '6_board.png'), BOARD_AT + Vector((0, -1.0, 4.4)), BOARD_AT, lens=42, res=(1500, 1100))
    # 7. the six objects in a row
    hide_objects(tuple(OBJECTS))
    for n in OBJECTS: OBJECTS[n][0].location = SHELF[n]
    render(os.path.join(out, '7_objects.png'), (0.15, -6.4, 1.3), (0.15, -2.4, 0.0), lens=42, res=(1800, 700))

if '--export' in ARGS:
    def export(path, obs, anim=False):
        select_only(*obs)
        kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                  export_animations=anim)
        if anim: kw['export_animation_mode'] = 'ACTIONS'
        bpy.ops.export_scene.gltf(**kw)
    rig.location = (0, 0, 0); board_root.location = (0, 0, 0)
    for n in OBJECTS: OBJECTS[n][0].location = (0, 0, 0)
    bpy.context.view_layer.update()
    set_lid(0); rig.animation_data.action = A_open
    export(os.path.join(HERE, 'mystery_box.glb'), [rig] + list(rig.children_recursive), anim=True)
    export(os.path.join(HERE, 'alphabet_board.glb'), [board_root] + list(board_root.children_recursive))
    od = os.path.join(HERE, 'objects'); os.makedirs(od, exist_ok=True)
    allobs = []
    for n, (root, _) in OBJECTS.items():
        obs = [root] + list(root.children_recursive); allobs += obs
        export(os.path.join(od, n + '.glb'), obs)
    for k, n in enumerate(OBJECTS): OBJECTS[n][0].location = (k*0.4, 0, 0)
    bpy.context.view_layer.update()
    export(os.path.join(HERE, 'objects_all.glb'), allobs)
