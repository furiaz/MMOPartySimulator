from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


CLIENT_ROOT = Path(__file__).resolve().parents[1]
GENERATED_ROOT = CLIENT_ROOT / "public" / "assets" / "Generated"
TICKET_ROOT = GENERATED_ROOT / "ticket-0516"
PASSIVE_SOURCE_ROOT = TICKET_ROOT / "source" / "passives"
BOOK_SOURCE_ROOT = TICKET_ROOT / "source" / "books"
REVIEW_ROOT = TICKET_ROOT / "review"
SKILL_EFFECT_ROOT = GENERATED_ROOT / "first-class-skill-effects"
SKILL_BOOK_ROOT = GENERATED_ROOT / "skill-book-icons" / "items"
SKILL_BOOK_BASE_ROOT = GENERATED_ROOT / "skill-book-icons" / "bases"
BEGINNER_BOOK_BASE_PATH = (
    GENERATED_ROOT / "ticket-0511" / "source" / "beginner_skill_book_base_32.png"
)
MARTIAL_BOOK_BASE_ROOT = GENERATED_ROOT / "ticket-0512" / "source" / "books"
RUNECASTER_ROOT = GENERATED_ROOT / "ticket-0515" / "runecaster"

RUNTIME_ICON_SIZE = (50, 50)
BOOK_ICON_SIZE = (14, 14)
BOOK_ICON_OFFSET = (11, 7)

CLASS_BOOK_COLORS = {
    "elementalist": "#177C82",
    "runecaster": "#6846A5",
    "lightbearer": "#BBC2CC",
    "penitent": "#3B4148",
}

CLASS_BOOK_SATURATION_FLOORS = {
    "elementalist": 0.55,
    "runecaster": 0.55,
    "lightbearer": 0.08,
    "penitent": 0.12,
}

CLASS_BOOK_LIGHTNESS_MULTIPLIERS = {
    "elementalist": 1.0,
    "runecaster": 1.0,
    "lightbearer": 1.0,
    "penitent": 0.58,
}

PASSIVE_CLASS_BY_ID = {
    "stable_overcharge": "elementalist",
    "arcane_crescendo": "elementalist",
    "word_resonance": "runecaster",
    "living_inscription": "runecaster",
    "overflowing_grace": "lightbearer",
    "many_beacons": "lightbearer",
    "crimson_authority": "penitent",
    "cruel_mercy": "penitent",
}

PASSIVE_LABELS = {
    "stable_overcharge": "Stable Overcharge",
    "arcane_crescendo": "Arcane Crescendo",
    "word_resonance": "Word Resonance",
    "living_inscription": "Living Inscription",
    "overflowing_grace": "Overflowing Grace",
    "many_beacons": "Many Beacons",
    "crimson_authority": "Crimson Authority",
    "cruel_mercy": "Cruel Mercy",
}

CLASS_SKILLS = {
    "elementalist": [
        ("elemental_bolt", "Elemental Bolt", "elemental_bolt.png"),
        ("mana_shield", "Mana Shield", "mana_shield.png"),
        ("frost_armor", "Frost Armor", "frost_armor.png"),
        ("overcharge", "Overcharge", "overcharge.png"),
        ("arcane_conduit", "Arcane Conduit", "arcane_conduit_caster.png"),
        ("emberwood_rhythm", "Emberwood Rhythm", "emberwood_rhythm.png"),
        ("flame_step", "Flame Step", "flame_step.png"),
        ("fire_burst", "Fire Burst", "fire_burst.png"),
        ("stable_overcharge", "Stable Overcharge", None),
        ("arcane_crescendo", "Arcane Crescendo", None),
    ],
    "runecaster": [
        ("binding_rune", "Binding Rune", "binding_rune.png"),
        ("rune_lance", "Rune Lance", "rune_lance.png"),
        ("warding_glyph", "Warding Glyph", "warding_glyph.png"),
        ("rewind_rune", "Rewind Rune", "rewind_rune.png"),
        ("runic_focus", "Runic Focus", "runic_focus.png"),
        ("leyline_matrix", "Leyline Matrix", "leyline_matrix.png"),
        ("stone_sigil_rhythm", "Stone Sigil Rhythm", "stone_sigil_rhythm.png"),
        ("rune_step", "Rune Step", "rune_step.png"),
        ("word_resonance", "Word Resonance", None),
        ("living_inscription", "Living Inscription", None),
    ],
    "lightbearer": [
        ("blinding_ray", "Blinding Ray", "blinding_ray.png"),
        ("light_mend", "Light Mend", "light_mend.png"),
        ("sanctuary_veil", "Sanctuary Veil", "sanctuary_veil.png"),
        ("guiding_light", "Guiding Light", "guiding_light.png"),
        ("radiant_benediction", "Radiant Benediction", "radiant_benediction_caster.png"),
        ("herbalist_hymn", "Herbalist Hymn", "herbalist_hymn.png"),
        ("dawn_step", "Dawn Step", "dawn_step.png"),
        ("circle_of_renewal", "Circle of Renewal", "circle_of_renewal.png"),
        ("overflowing_grace", "Overflowing Grace", None),
        ("many_beacons", "Many Beacons", None),
    ],
    "penitent": [
        ("whip_prison", "Whip Prison", "whip_prison_caster.png"),
        ("flagellant_lash", "Flagellant Lash", "flagellant_lash.png"),
        ("martyrs_veil", "Martyr's Veil", "martyrs_veil.png"),
        ("penitents_gift", "Penitent's Gift", "penitents_gift.png"),
        ("eternal_hope", "Eternal Hope", "eternal_hope.png"),
        ("burdened_benediction", "Burdened Benediction", "burdened_benediction_caster.png"),
        ("woodcutting_penance", "Woodcutting Penance", "woodcutting_penance.png"),
        ("atonement_step", "Atonement Step", "atonement_step.png"),
        ("crimson_authority", "Crimson Authority", None),
        ("cruel_mercy", "Cruel Mercy", None),
    ],
}


def get_font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
    ):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def trim_transparency(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    significant_alpha = alpha.point(lambda value: 255 if value >= 32 else 0)
    bounds = significant_alpha.getbbox()
    return rgba.crop(bounds) if bounds else rgba


def fit_transparent(
    image: Image.Image,
    size: tuple[int, int],
    *,
    padding: int = 0,
) -> Image.Image:
    trimmed = trim_transparency(image)
    available = (max(1, size[0] - padding * 2), max(1, size[1] - padding * 2))
    trimmed.thumbnail(available, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - trimmed.width) // 2
    y = (size[1] - trimmed.height) // 2
    canvas.alpha_composite(trimmed, (x, y))
    return canvas


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.removeprefix("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def recolor_book_base(class_id: str) -> Image.Image:
    base = Image.open(BEGINNER_BOOK_BASE_PATH).convert("RGBA")
    target_rgb = hex_to_rgb(CLASS_BOOK_COLORS[class_id])
    target_hue, _, target_saturation = colorsys.rgb_to_hls(
        *(channel / 255 for channel in target_rgb)
    )
    saturation_floor = CLASS_BOOK_SATURATION_FLOORS[class_id]
    lightness_multiplier = CLASS_BOOK_LIGHTNESS_MULTIPLIERS[class_id]

    recolored_pixels = []
    for red, green, blue, alpha in base.get_flattened_data():
        if alpha == 0:
            recolored_pixels.append((red, green, blue, alpha))
            continue

        source_hue, source_lightness, source_saturation = colorsys.rgb_to_hls(
            red / 255,
            green / 255,
            blue / 255,
        )
        is_gold_trim = (
            0.085 <= source_hue <= 0.18
            and source_saturation >= 0.55
            and source_lightness >= 0.32
            and blue <= green * 0.55
        )
        if is_gold_trim:
            recolored_pixels.append((red, green, blue, alpha))
            continue

        saturation = max(target_saturation * 0.9, saturation_floor)
        lightness = max(0.0, min(1.0, source_lightness * lightness_multiplier))
        recolored = colorsys.hls_to_rgb(target_hue, lightness, saturation)
        recolored_pixels.append(
            tuple(round(channel * 255) for channel in recolored) + (alpha,)
        )

    recolored_base = Image.new("RGBA", base.size)
    recolored_base.putdata(recolored_pixels)
    return recolored_base


def draw_glow_line(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    color: tuple[int, int, int, int],
) -> None:
    draw.line(points, fill=(60, 20, 110, 180), width=5, joint="curve")
    draw.line(points, fill=color, width=2, joint="curve")


def build_runecaster_passive_sources() -> None:
    word_resonance = Image.new("RGBA", RUNTIME_ICON_SIZE, (0, 0, 0, 0))
    word_draw = ImageDraw.Draw(word_resonance)
    draw_glow_line(word_draw, [(13, 30), (25, 18), (37, 30)], (132, 224, 255, 255))
    draw_glow_line(word_draw, [(13, 22), (25, 34), (37, 22)], (193, 113, 255, 255))
    qqen = fit_transparent(Image.open(RUNECASTER_ROOT / "seals" / "qqen.png"), (20, 20))
    tafala = fit_transparent(Image.open(RUNECASTER_ROOT / "seals" / "tafala.png"), (20, 20))
    word_resonance.alpha_composite(qqen, (2, 15))
    word_resonance.alpha_composite(tafala, (28, 15))
    word_resonance.save(PASSIVE_SOURCE_ROOT / "word_resonance.png")

    living_inscription = Image.new("RGBA", RUNTIME_ICON_SIZE, (0, 0, 0, 0))
    living_draw = ImageDraw.Draw(living_inscription)
    living_draw.ellipse((7, 7, 42, 42), outline=(111, 59, 173, 220), width=5)
    living_draw.ellipse((9, 9, 40, 40), outline=(143, 229, 255, 255), width=2)
    living_draw.ellipse((22, 22, 28, 28), fill=(235, 247, 255, 255))
    aztta = fit_transparent(Image.open(RUNECASTER_ROOT / "seals" / "aztta.png"), (19, 19))
    amesten = fit_transparent(Image.open(RUNECASTER_ROOT / "seals" / "amesten.png"), (19, 19))
    living_inscription.alpha_composite(aztta, (3, 5))
    living_inscription.alpha_composite(amesten, (28, 26))
    living_inscription.save(PASSIVE_SOURCE_ROOT / "living_inscription.png")


def build_runtime_passive_icons() -> None:
    build_runecaster_passive_sources()
    review_root = REVIEW_ROOT / "passive-sprites"
    review_root.mkdir(parents=True, exist_ok=True)

    for passive_id, class_id in PASSIVE_CLASS_BY_ID.items():
        source = Image.open(PASSIVE_SOURCE_ROOT / f"{passive_id}.png")
        sprite = fit_transparent(source, RUNTIME_ICON_SIZE, padding=2)
        sprite.save(review_root / f"{passive_id}.png")
        production_root = SKILL_EFFECT_ROOT / class_id / "sprites"
        production_root.mkdir(parents=True, exist_ok=True)
        sprite.save(production_root / f"{passive_id}.png")


def get_skill_icon_path(
    class_id: str,
    skill_id: str,
    active_filename: str | None,
) -> Path:
    if active_filename is None:
        return REVIEW_ROOT / "passive-sprites" / f"{skill_id}.png"
    if class_id == "runecaster":
        return RUNECASTER_ROOT / "icons" / active_filename
    return SKILL_EFFECT_ROOT / class_id / "sprites" / active_filename


def build_book(base: Image.Image, icon: Image.Image) -> Image.Image:
    book = base.copy()
    badge = fit_transparent(icon, BOOK_ICON_SIZE)
    book.alpha_composite(badge, BOOK_ICON_OFFSET)
    return book


def build_books() -> None:
    BOOK_SOURCE_ROOT.mkdir(parents=True, exist_ok=True)
    SKILL_BOOK_BASE_ROOT.mkdir(parents=True, exist_ok=True)

    existing_bases = {
        "beginner": BEGINNER_BOOK_BASE_PATH,
        "blade": MARTIAL_BOOK_BASE_ROOT / "blade_book_base.png",
        "aegis": MARTIAL_BOOK_BASE_ROOT / "aegis_book_base.png",
        "hunter": MARTIAL_BOOK_BASE_ROOT / "hunter_book_base.png",
        "beast": MARTIAL_BOOK_BASE_ROOT / "beast_book_base.png",
    }
    for class_id, path in existing_bases.items():
        Image.open(path).convert("RGBA").save(
            SKILL_BOOK_BASE_ROOT / f"{class_id}_skill_book_base.png"
        )

    for class_id, skills in CLASS_SKILLS.items():
        base = recolor_book_base(class_id)
        base.save(BOOK_SOURCE_ROOT / f"{class_id}_book_base.png")
        base.save(SKILL_BOOK_BASE_ROOT / f"{class_id}_skill_book_base.png")
        review_root = REVIEW_ROOT / "books" / class_id
        production_root = SKILL_BOOK_ROOT / class_id
        review_root.mkdir(parents=True, exist_ok=True)
        production_root.mkdir(parents=True, exist_ok=True)

        for skill_id, _, active_filename in skills:
            icon = Image.open(get_skill_icon_path(class_id, skill_id, active_filename))
            book = build_book(base, icon)
            filename = f"{skill_id}_skill_book.png"
            book.save(review_root / filename)
            book.save(production_root / filename)


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    area: tuple[int, int, int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int, int],
) -> None:
    left, top, right, bottom = area
    bounds = draw.textbbox((0, 0), text, font=font)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    draw.text(
        ((left + right - width) // 2, (top + bottom - height) // 2),
        text,
        font=font,
        fill=fill,
        stroke_width=2,
        stroke_fill=(10, 12, 18, 255),
    )


def build_passive_sheet() -> None:
    entries = list(PASSIVE_CLASS_BY_ID.items())
    cell_width = 280
    cell_height = 300
    sheet = Image.new("RGBA", (cell_width * 4, cell_height * 2), (20, 22, 30, 255))
    draw = ImageDraw.Draw(sheet)
    title_font = get_font(22)
    class_font = get_font(15)

    for index, (passive_id, class_id) in enumerate(entries):
        column = index % 4
        row = index // 4
        x = column * cell_width
        y = row * cell_height
        icon = Image.open(REVIEW_ROOT / "passive-sprites" / f"{passive_id}.png")
        sheet.alpha_composite(icon.resize((200, 200), Image.Resampling.NEAREST), (x + 40, y + 10))
        draw_centered_text(
            draw,
            (x + 8, y + 215, x + cell_width - 8, y + 260),
            PASSIVE_LABELS[passive_id],
            title_font,
            (244, 242, 235, 255),
        )
        draw_centered_text(
            draw,
            (x + 8, y + 258, x + cell_width - 8, y + 290),
            class_id.title(),
            class_font,
            (166, 177, 195, 255),
        )

    sheets_root = REVIEW_ROOT / "sheets"
    sheets_root.mkdir(parents=True, exist_ok=True)
    sheet.save(sheets_root / "magic-support-passive-icons.png")


def build_book_sheets() -> None:
    sheets_root = REVIEW_ROOT / "sheets"
    sheets_root.mkdir(parents=True, exist_ok=True)
    label_font = get_font(15)

    for class_id, skills in CLASS_SKILLS.items():
        cell_width = 190
        cell_height = 180
        sheet = Image.new("RGBA", (cell_width * 5, cell_height * 2), (20, 22, 30, 255))
        draw = ImageDraw.Draw(sheet)
        for index, (skill_id, label, _) in enumerate(skills):
            column = index % 5
            row = index // 5
            x = column * cell_width
            y = row * cell_height
            book = Image.open(REVIEW_ROOT / "books" / class_id / f"{skill_id}_skill_book.png")
            sheet.alpha_composite(book.resize((128, 128), Image.Resampling.NEAREST), (x + 31, y + 4))
            draw_centered_text(
                draw,
                (x + 5, y + 132, x + cell_width - 5, y + cell_height - 5),
                label,
                label_font,
                (244, 242, 235, 255),
            )
        sheet.save(sheets_root / f"{class_id}-skill-books.png")


def build_all_class_cover_sheet() -> None:
    entries = [
        ("Beginner", "beginner"),
        ("Blade", "blade"),
        ("Aegis", "aegis"),
        ("Hunter", "hunter"),
        ("Beast", "beast"),
        ("Elementalist", "elementalist"),
        ("Runecaster", "runecaster"),
        ("Lightbearer", "lightbearer"),
        ("Penitent", "penitent"),
    ]
    cell_width = 180
    cell_height = 180
    sheet = Image.new("RGBA", (cell_width * len(entries), cell_height), (20, 22, 30, 255))
    draw = ImageDraw.Draw(sheet)
    font = get_font(17)

    for index, (label, class_id) in enumerate(entries):
        x = index * cell_width
        path = SKILL_BOOK_BASE_ROOT / f"{class_id}_skill_book_base.png"
        book = Image.open(path).convert("RGBA")
        sheet.alpha_composite(book.resize((128, 128), Image.Resampling.NEAREST), (x + 26, 4))
        draw_centered_text(
            draw,
            (x + 4, 134, x + cell_width - 4, cell_height - 4),
            label,
            font,
            (244, 242, 235, 255),
        )

    sheets_root = REVIEW_ROOT / "sheets"
    sheets_root.mkdir(parents=True, exist_ok=True)
    sheet.save(sheets_root / "all-class-book-standard.png")


def main() -> None:
    build_runtime_passive_icons()
    build_books()
    build_passive_sheet()
    build_book_sheets()
    build_all_class_cover_sheet()


if __name__ == "__main__":
    main()
