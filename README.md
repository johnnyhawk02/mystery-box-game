# Mystery Box

A calm letter game for autistic children. Tap the box, look at the object that comes out,
and drag it onto the letter it starts with. A wrong drop floats gently back; after two tries
the right letter softly glows.

Live: https://mysterybox.johnnyhawk.org

- `main.js` is the game (Three.js, no build step)
- `assets/` holds the models, made in Blender by `blender/build_game_models.py`
  (`Blender -b -P build_game_models.py -- --export`)
- Objects so far: apple, ball, cup, duck, egg, fish (A to F)
