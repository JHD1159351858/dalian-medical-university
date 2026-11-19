"""Shared landmarks in metres. Characters face Blender -Y and stand on Z=0."""

PROFILES = {
    # chin, hips, shoulder half-width, pelvic half-width, stride angle, right stride ratio
    "lin-yue":   (.943, .454, .188, .096, .35, 1.00),
    "chen-yang": (.974, .470, .207, .095, .40, 1.00),
    "zhou-ning": (.938, .458, .184, .099, .32, 1.00),
    "zhao-hang": (.993, .483, .216, .095, .36, .74),
    "sun-lan":   (.900, .425, .184, .105, .29, .87),
}

PARENTS = {"Hips": "Root", "Chest": "Hips", "Head": "Chest"}
for side in ("L", "R"):
    for name, parent in (("UpperArm", "Chest"), ("Forearm", "UpperArm"), ("Hand", "Forearm"),
                         ("Thigh", "Hips"), ("Shin", "Thigh"), ("Foot", "Shin")):
        PARENTS[f"{name}.{side}"] = parent if parent in ("Chest", "Hips") else f"{parent}.{side}"


def landmarks(case_id):
    chin, hips, shoulder, pelvis, _, _ = PROFILES[case_id]
    chest = hips + (chin - hips) * .37
    points = {"Root": (0, 0, 0), "Hips": (0, 0, hips), "Chest": (0, 0, chest), "Head": (0, -.012, chin)}
    for side, sign in (("L", 1), ("R", -1)):
        points.update({
            "UpperArm." + side: (sign * shoulder, .003, chin - .103),
            "Forearm." + side: (sign * (shoulder + .040), -.002, chin - .284),
            "Hand." + side: (sign * (shoulder + .058), -.025, chin - .443),
            "Thigh." + side: (sign * pelvis, .003, hips),
            "Shin." + side: (sign * (pelvis + .007), -.006, (hips + .069) / 2),
            "Foot." + side: (sign * (pelvis + .010), 0, .069),
        })
    return points
