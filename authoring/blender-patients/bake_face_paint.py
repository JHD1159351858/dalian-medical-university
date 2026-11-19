"""Repaint UV atlases from the teaching portraits. Run with Python, Pillow, NumPy and SciPy."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates

from face_specs import CASES, Projection, RINGS

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / 'textures'

def bake(case_id, spec):
    portrait = Image.open(HERE.parent.parent / 'public' / 'case-portraits' / (case_id+'.webp')).convert('RGB')
    pixels = np.asarray(portrait, dtype=float) / 255
    mask_image = Image.new('L', portrait.size, 0)
    ImageDraw.Draw(mask_image).polygon(spec['perimeter'], fill=255)
    mask = np.array(mask_image) > 0
    # Erode the polygon edges softly, so no hair, hand or shirt paint wraps around the temples.
    inner_distance = distance_transform_edt(mask)
    valid = np.clip((inner_distance - 2)/12, 0, 1)
    valid = valid * valid * (3-2*valid)

    size_x, size_y = 1024, 512
    v, u = np.mgrid[0:size_y, 0:size_x]
    a = ((u+.5)/size_x*2-1)*np.pi
    z = (1-(v+.5)/size_y)*.67
    knots = np.array(RINGS)
    radius = np.interp(z, knots[:,0], knots[:,1])*spec['width']
    # The lower face has an individual taper; match the sculpt in faces.py.
    radius += spec['jaw']*np.exp(-((z-.15)/.086)**2)
    x = np.sin(a)*radius
    proj = Projection(spec)
    px, py = proj.project(x,z)
    uv = [py,px]
    observed = np.stack([map_coordinates(pixels[:,:,i], uv, order=1, mode='nearest') for i in range(3)], axis=-1)
    ink = map_coordinates(valid, uv, order=1, mode='nearest') * np.clip(np.cos(a)*4, 0,1)
    # Broad illumination in the source is subdued; eyelids, pigmentation and lip relief are retained.
    filtered_weight = gaussian_filter(valid, 24)
    low = gaussian_filter(np.mean(pixels, axis=2)*valid, 24) / np.maximum(filtered_weight, .01)
    local_value = map_coordinates(low, uv, order=1, mode='nearest')
    skin = np.array(spec['skin']) / 255
    correction = np.clip((skin.mean()-local_value)*.23, -.05, .06)
    observed += correction[...,None]
    warm = np.exp(-((np.abs(x)-.23)/.095)**2-((z-.23)/.11)**2)*np.maximum(0,np.cos(a))
    base = np.broadcast_to(skin,(size_y,size_x,3)).copy()
    base += warm[...,None]*np.array([.022,-.018,-.026])
    color = base*(1-ink[...,None])+observed*ink[...,None]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.uint8(np.clip(color*255+.5,0,255))).save(OUTPUT/(case_id+'-face.png'),optimize=True)

if __name__=='__main__':
    for patient, spec in CASES.items():
        bake(patient,spec)

