"""Render the screen guide with Archify, using lighter copies of the original captures."""
import argparse
import re
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

DOCS = Path(__file__).resolve().parents[1]
OUTPUT = DOCS / "architecture/figures/v1-guide.html"
MOBILE_TOOLS = """
<style media="(max-width: 600px)">
.tools.interactive { max-width: 100%; flex-wrap: wrap; }
</style>
"""


def render(archify):
    with TemporaryDirectory() as directory:
        stage = Path(directory)

        def prepare_image(match):
            original = DOCS / match[1]
            preview = stage / (match[1] + ".webp")
            preview.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(original) as image:
                image.thumbnail((1100, 5000))
                image.save(preview, format="WEBP", quality=87)
            return f'@image path="{preview.relative_to(stage)}"'

        source = DOCS / "v1-guide.archify.md"
        draft = stage / source.name
        draft.write_text(re.sub(r'^@image path="([^"]+)"', prepare_image, source.read_text(), flags=re.M))
        generated = stage / "archify-guide.html"
        subprocess.run(["node", archify, "finalize", "explainer", draft, generated,
                        "--repo-root", DOCS.parent, "--out-dir", stage], check=True)
        # Archify 3.2.0's export menu otherwise extends past a narrow viewport.
        html = generated.read_text()
        if "</head>" not in html:
            raise ValueError("Archify output has no HTML head")
        mobile_guide = stage / OUTPUT.name
        html = html.replace("</head>", MOBILE_TOOLS + "</head>", 1)
        mobile_guide.write_text(re.sub(r"(?m)^[ \t]+$", "", html))
        subprocess.run(["node", archify, "check", mobile_guide], check=True)
        OUTPUT.write_bytes(mobile_guide.read_bytes())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archify", type=Path, help="path to the installed archify.mjs")
    render(parser.parse_args().archify.resolve())
