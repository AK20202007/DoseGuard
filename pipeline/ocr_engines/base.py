from __future__ import annotations
from abc import ABC, abstractmethod
from PIL.Image import Image
from ..models import ExtractedPrescription


class BaseOCREngine(ABC):
    """Common interface every OCR engine must implement."""

    name: str = "base"

    @abstractmethod
    async def extract(self, image: Image) -> ExtractedPrescription:
        """
        Run OCR + field extraction on a PIL Image.
        Must always return an ExtractedPrescription (never raise).
        On failure set ExtractedPrescription.error and leave fields None.
        """
        ...

    def _safe_result(self, error: str) -> ExtractedPrescription:
        return ExtractedPrescription(engine=self.name, error=error)
