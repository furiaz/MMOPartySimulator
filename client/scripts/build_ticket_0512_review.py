from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


CLIENT_ROOT = Path(__file__).resolve().parents[1]
GENERATED_ROOT = CLIENT_ROOT / "public" / "assets" / "Generated"
TICKET_ROOT = GENERATED_ROOT / "ticket-0512"
PASSIVE_SOURCE_ROOT = TICKET_ROOT / "source" / "passives"
BOOK_SOURCE_ROOT = TICKET_ROOT / "source" / "books"
REVIEW_ROOT = TICKET_ROOT / "review"
SKILL_EFFECT_ROOT = GENERATED_ROOT / "first-class-skill-effects"
SKILL_BOOK_ROOT = GENERATED_ROOT / "skill-book-icons" / "items"
BEGINNER_BOOK_BASE_PATH = (
    GENERATED_ROOT / "ticket-0511" / "source" / "beginner_skill_book_base_32.png"
)
BOOK_ICON_SIZE = (14, 14)
BOOK_ICON_OFFSET = (11, 7)

CLASS_BOOK_COLORS = {
    "blade": "#8E2634",
    "aegis": "#4F718C",
    "hunter": "#3F6B46",
    "beast": "#A7682E",
}

CLASS_SKILLS = {
    "blade": [
        ("duelist_challenge", "Duelist Challenge", "duelist_challenge.png"),
        ("second_wind", "Second Wind", "second_wind.png"),
        ("blade_parry", "Blade Parry", "blade_parry.png"),
        ("edge_focus", "Edge Focus", "edge_focus.png"),
        ("press_the_opening", "Press the Opening", "press_the_opening_caster.png"),
        ("woodcutter_rhythm", "Woodcutter Rhythm", "woodcutter_rhythm.png"),
        ("flash_step", "Flash Step", "flash_step.png"),
        ("sweeping_strike", "Sweeping Strike", "sweeping_strike.png"),
        ("duelists_momentum", "Duelist's Momentum", None),
        ("riposte_training", "Riposte Training", None),
    ],
    "aegis": [
        ("shield_challenge", "Shield Challenge", "shield_challenge.png"),
        ("hold_fast", "Hold Fast", "hold_fast.png"),
        ("guard_wall", "Guard Wall", "guard_wall.png"),
        ("iron_stance", "Iron Stance", "iron_stance.png"),
        ("shield_formation", "Shield Formation", "shield_formation_caster.png"),
        ("stonebreaker_rhythm", "Stonebreaker Rhythm", "stonebreaker_rhythm.png"),
        ("shield_rush", "Shield Rush", "shield_rush.png"),
        ("shield_shockwave", "Shield Shockwave", "shield_shockwave.png"),
        ("rooted_bastion", "Rooted Bastion", None),
        ("unbroken_line", "Unbroken Line", None),
    ],
    "hunter": [
        ("pinning_shot", "Pinning Shot", "pinning_shot.png"),
        ("fake_death", "Fake Death", "fake_death.png"),
        ("evasive_instinct", "Evasive Instinct", "evasive_instinct.png"),
        ("hunters_focus", "Hunter's Focus", "hunters_focus.png"),
        ("poison_coating", "Poison Coating", "poison_coating_caster.png"),
        ("herbalist_rhythm", "Herbalist Rhythm", "herbalist_rhythm.png"),
        ("skirmish_shot", "Skirmish Shot", "skirmish_shot.png"),
        ("arrow_burst", "Arrow Burst", "arrow_burst.png"),
        ("headhunter", "Headhunter", None),
        ("exploit_the_snare", "Exploit the Snare", None),
    ],
    "beast": [
        ("threatening_roar", "Threatening Roar", "threatening_roar.png"),
        ("blood_feast", "Blood Feast", "blood_feast.png"),
        ("rugged_hide", "Rugged Hide", "rugged_hide.png"),
        ("feral_surge", "Feral Surge", "feral_surge.png"),
        ("pack_frenzy", "Pack Frenzy", "pack_frenzy_caster.png"),
        ("stoneclaw_rhythm", "Stoneclaw Rhythm", "stoneclaw_rhythm.png"),
        ("pounce", "Pounce", "pounce.png"),
        ("maul_sweep", "Maul Sweep", "maul_sweep.png"),
        ("blood_scent", "Blood Scent", None),
        ("pack_instinct", "Pack Instinct", None),
    ],
}


def get_font(size: int) -> ImageFont.ImageFont:
    font_candidates = (
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
    )
    for candidate in font_candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def trim_transparency(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bounds = rgba.getchannel("A").getbbox()
    return rgba.crop(bounds) if bounds else rgba


def fit_transparent(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    trimmed = trim_transparency(image)
    trimmed.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - trimmed.width) // 2
    y = (size[1] - trimmed.height) // 2
    canvas.alpha_composite(trimmed, (x, y))
    return canvas


def icon_path(class_id: str, skill_id: str, active_filename: str | None) -> Path:
    if active_filename is None:
        return PASSIVE_SOURCE_ROOT / f"{skill_id}.png"
    return SKILL_EFFECT_ROOT / class_id / "sprites" / active_filename


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.removeprefix("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def recolor_beginner_book_base(class_id: str) -> Image.Image:
    base = Image.open(BEGINNER_BOOK_BASE_PATH).convert("RGBA")
    target_rgb = hex_to_rgb(CLASS_BOOK_COLORS[class_id])
    target_hue, _, target_saturation = colorsys.rgb_to_hls(
        *(channel / 255 for channel in target_rgb)
    )

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

        saturation = max(target_saturation * 0.9, 0.45)
        recolored = colorsys.hls_to_rgb(target_hue, source_lightness, saturation)
        recolored_pixels.append(
            tuple(round(channel * 255) for channel in recolored) + (alpha,)
        )

    recolored_base = Image.new("RGBA", base.size)
    recolored_base.putdata(recolored_pixels)
    return recolored_base


def build_runtime_sprites() -> None:
    output_root = REVIEW_ROOT / "passive-sprites"
    output_root.mkdir(parents=True, exist_ok=True)
    passive_ids = [
        "duelists_momentum",
        "riposte_training",
        "rooted_bastion",
        "unbroken_line",
        "headhunter",
        "exploit_the_snare",
        "blood_scent",
        "pack_instinct",
    ]
    for passive_id in passive_ids:
        source = Image.open(PASSIVE_SOURCE_ROOT / f"{passive_id}.png")
        sprite = fit_transparent(source, (50, 50))
        sprite.save(output_root / f"{passive_id}.png")
        class_id = next(
            class_id
            for class_id, skills in CLASS_SKILLS.items()
            if any(skill_id == passive_id for skill_id, _, _ in skills)
        )
        production_root = SKILL_EFFECT_ROOT / class_id / "sprites"
        production_root.mkdir(parents=True, exist_ok=True)
        sprite.save(production_root / f"{passive_id}.png")


def build_book(base: Image.Image, icon: Image.Image) -> Image.Image:
    book = base.copy()
    badge = fit_transparent(icon, BOOK_ICON_SIZE)
    book.alpha_composite(badge, BOOK_ICON_OFFSET)
    return book


def build_books() -> None:
    BOOK_SOURCE_ROOT.mkdir(parents=True, exist_ok=True)
    for class_id, skills in CLASS_SKILLS.items():
        base = recolor_beginner_book_base(class_id)
        base.save(BOOK_SOURCE_ROOT / f"{class_id}_book_base.png")
        output_root = REVIEW_ROOT / "books" / class_id
        output_root.mkdir(parents=True, exist_ok=True)
        production_root = SKILL_BOOK_ROOT / class_id
        production_root.mkdir(parents=True, exist_ok=True)
        for skill_id, _, active_filename in skills:
            source = Image.open(icon_path(class_id, skill_id, active_filename))
            book = build_book(base, source)
            book.save(output_root / f"{skill_id}_skill_book.png")
            book.save(production_root / f"{skill_id}_skill_book.png")


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
    entries = []
    for class_id, skills in CLASS_SKILLS.items():
        entries.extend((class_id, skill_id, label) for skill_id, label, filename in skills if filename is None)

    cell_width = 300
    cell_height = 330
    sheet = Image.new("RGBA", (cell_width * 4, cell_height * 2), (20, 22, 30, 255))
    draw = ImageDraw.Draw(sheet)
    title_font = get_font(24)
    class_colors = {
        "blade": (142, 38, 52, 255),
        "aegis": (79, 113, 140, 255),
        "hunter": (63, 107, 70, 255),
        "beast": (167, 104, 46, 255),
    }

    for index, (class_id, skill_id, label) in enumerate(entries):
        column = index % 4
        row = index // 4
        x = column * cell_width
        y = row * cell_height
        draw.rounded_rectangle(
            (x + 8, y + 8, x + cell_width - 8, y + cell_height - 8),
            radius=18,
            fill=(31, 34, 45, 255),
            outline=class_colors[class_id],
            width=5,
        )
        icon = fit_transparent(Image.open(PASSIVE_SOURCE_ROOT / f"{skill_id}.png"), (240, 240))
        sheet.alpha_composite(icon, (x + 30, y + 20))
        draw_centered_text(
            draw,
            (x + 12, y + 266, x + cell_width - 12, y + cell_height - 12),
            label,
            title_font,
            (244, 242, 235, 255),
        )

    sheets_root = REVIEW_ROOT / "sheets"
    sheets_root.mkdir(parents=True, exist_ok=True)
    sheet.save(sheets_root / "martial-passive-icons.png")


def build_book_sheets() -> None:
    sheet_root = REVIEW_ROOT / "sheets"
    sheet_root.mkdir(parents=True, exist_ok=True)
    production_sheet_root = GENERATED_ROOT / "skill-book-icons" / "sheets"
    production_sheet_root.mkdir(parents=True, exist_ok=True)
    label_font = get_font(16)

    for class_id, skills in CLASS_SKILLS.items():
        cell_width = 190
        cell_height = 190
        sheet = Image.new("RGBA", (cell_width * 5, cell_height * 2), (20, 22, 30, 255))
        draw = ImageDraw.Draw(sheet)
        for index, (skill_id, label, _) in enumerate(skills):
            column = index % 5
            row = index // 5
            x = column * cell_width
            y = row * cell_height
            draw.rounded_rectangle(
                (x + 6, y + 6, x + cell_width - 6, y + cell_height - 6),
                radius=14,
                fill=(31, 34, 45, 255),
                outline=(70, 74, 88, 255),
                width=2,
            )
            book = Image.open(REVIEW_ROOT / "books" / class_id / f"{skill_id}_skill_book.png")
            enlarged = book.resize((128, 128), Image.Resampling.NEAREST)
            sheet.alpha_composite(enlarged, (x + 31, y + 10))
            draw_centered_text(
                draw,
                (x + 8, y + 139, x + cell_width - 8, y + cell_height - 8),
                label,
                label_font,
                (244, 242, 235, 255),
            )
        sheet.save(sheet_root / f"{class_id}-skill-books.png")
        sheet.save(production_sheet_root / f"skill-books-{class_id}-grid.png")


def build_book_standard_sheet() -> None:
    examples = [
        (
            "Beginner",
            SKILL_BOOK_ROOT / "beginner" / "resourcefulness_skill_book.png",
        ),
        (
            "Blade",
            SKILL_BOOK_ROOT / "blade" / "duelists_momentum_skill_book.png",
        ),
        (
            "Aegis",
            SKILL_BOOK_ROOT / "aegis" / "rooted_bastion_skill_book.png",
        ),
        (
            "Hunter",
            SKILL_BOOK_ROOT / "hunter" / "headhunter_skill_book.png",
        ),
        (
            "Beast",
            SKILL_BOOK_ROOT / "beast" / "blood_scent_skill_book.png",
        ),
    ]
    cell_width = 190
    cell_height = 190
    sheet = Image.new(
        "RGBA",
        (cell_width * len(examples), cell_height),
        (20, 22, 30, 255),
    )
    draw = ImageDraw.Draw(sheet)
    label_font = get_font(18)
    for index, (label, path) in enumerate(examples):
        x = index * cell_width
        draw.rounded_rectangle(
            (x + 6, 6, x + cell_width - 6, cell_height - 6),
            radius=14,
            fill=(31, 34, 45, 255),
            outline=(70, 74, 88, 255),
            width=2,
        )
        book = Image.open(path).convert("RGBA")
        sheet.alpha_composite(
            book.resize((128, 128), Image.Resampling.NEAREST),
            (x + 31, 10),
        )
        draw_centered_text(
            draw,
            (x + 8, 139, x + cell_width - 8, cell_height - 8),
            label,
            label_font,
            (244, 242, 235, 255),
        )

    sheet_root = REVIEW_ROOT / "sheets"
    sheet_root.mkdir(parents=True, exist_ok=True)
    sheet.save(sheet_root / "beginner-and-martial-book-standard.png")


def main() -> None:
    build_runtime_sprites()
    build_books()
    build_passive_sheet()
    build_book_sheets()
    build_book_standard_sheet()


if __name__ == "__main__":
    main()
