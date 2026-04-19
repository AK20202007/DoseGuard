from .base import BaseOCREngine
from .easyocr_engine import EasyOCREngine
from .paddleocr_engine import PaddleOCREngine
from .tesseract_engine import TesseractEngine
from .rapidocr_engine import RapidOCREngine
from .moondream_engine import MoondreamEngine     # kept as optional
from .llava_engine import LLaVAEngine
from .paligemma_engine import PaliGemmaEngine
from .claude_vision_engine import ClaudeVisionEngine

__all__ = [
    "BaseOCREngine", "EasyOCREngine", "PaddleOCREngine",
    "TesseractEngine", "RapidOCREngine", "MoondreamEngine",
    "LLaVAEngine", "PaliGemmaEngine", "ClaudeVisionEngine",
]
