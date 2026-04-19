#!/usr/bin/env python3
"""
MedPipeline CLI — Layer 1 + Layer 2 prescription verification.

Usage:
    python main.py verify label.jpg
    python main.py verify label.jpg --layer1-only
    python main.py demo
"""
from __future__ import annotations
import asyncio
import json
import os
import sys
from pathlib import Path

import click
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box

load_dotenv()

console = Console()


# ── Helpers ──────────────────────────────────────────────────────────

def _status_color(status: str) -> str:
    return {
        "passed": "bold green",
        "recapture_required": "bold yellow",
        "clinical_impossibility": "bold red",
        "drug_not_found": "bold orange3",
        "error": "bold red",
    }.get(status, "white")


def _print_result(result) -> None:
    color = _status_color(result.status)
    console.print(
        Panel(result.message, title=f"[{color}]{result.status.upper()}[/]", border_style=color)
    )

    if result.layer1:
        l1 = result.layer1
        tbl = Table(title="Layer 1 — OCR Consensus", box=box.SIMPLE_HEAD)
        tbl.add_column("Field", style="cyan")
        tbl.add_column("Agreed Value")
        tbl.add_column("Score", justify="right")
        tbl.add_column("Engine Votes")

        for field, fc in l1.field_scores.items():
            score_color = "green" if fc.unanimous else "red"
            votes_str = "  |  ".join(f"{eng}: {v}" for eng, v in fc.votes.items())
            tbl.add_row(
                field,
                str(fc.agreed_value or "—"),
                f"[{score_color}]{fc.score:.2f}[/]",
                votes_str,
            )
        console.print(tbl)

    if result.layer2:
        l2 = result.layer2
        tbl2 = Table(title="Layer 2 — Safety Vault", box=box.SIMPLE_HEAD)
        tbl2.add_column("Check", style="cyan")
        tbl2.add_column("Result")
        tbl2.add_row("Medication verified", "✓" if l2.medication_name_verified else "✗")
        tbl2.add_row("Dose verified", "✓" if l2.dose_verified else "✗")
        tbl2.add_row("OpenFDA hit", "✓" if l2.openfda_hit else "✗")
        tbl2.add_row("DailyMed hit", "✓" if l2.dailymed_hit else "✗")
        tbl2.add_row("Extracted dose", l2.extracted_dose_label or "—")
        if l2.known_strengths:
            tbl2.add_row(
                "Known strengths",
                ", ".join(sorted({s.label for s in l2.known_strengths})),
            )
        if l2.clinical_impossibility:
            tbl2.add_row("[bold red]CLINICAL IMPOSSIBILITY[/]", l2.impossibility_reason or "")
        console.print(tbl2)


# ── Commands ─────────────────────────────────────────────────────────

@click.group()
def cli():
    """MedPipeline: AI-powered prescription verification with safety checks."""


@cli.command()
@click.argument("image_path", type=click.Path(exists=True))
@click.option("--layer1-only", is_flag=True, help="Run only the OCR consensus layer.")
@click.option("--json-out", is_flag=True, help="Print results as JSON.")
def verify(image_path: str, layer1_only: bool, json_out: bool):
    """Verify a prescription label image."""
    from pipeline.pipeline import MedPipeline
    from pipeline.layer1_ocr_ensemble import OCREnsembleCouncil
    from pipeline.layer2_safety_vault import DeterministicSafetyVault

    async def _run():
        if layer1_only:
            council = OCREnsembleCouncil()
            from PIL import Image
            img = Image.open(image_path).convert("RGB")
            result = await council.run(img)
            if json_out:
                click.echo(result.model_dump_json(indent=2))
            else:
                console.print_json(result.model_dump_json(indent=2))
            return

        pipeline = MedPipeline()
        result = await pipeline.run(image_path)
        if json_out:
            click.echo(result.model_dump_json(indent=2))
        else:
            _print_result(result)

    asyncio.run(_run())


@cli.command()
def demo():
    """Run a quick demo using a synthetic prescription label (no image required)."""
    from pipeline.layer1_ocr_ensemble import OCREnsembleCouncil
    from pipeline.layer2_safety_vault import DeterministicSafetyVault
    from pipeline.models import ConsensusResult, FieldConsensus, ExtractedPrescription
    from pipeline.pipeline import MedPipeline

    console.rule("[bold]MedPipeline Demo[/]")

    async def _demo():
        vault = DeterministicSafetyVault()

        # --- Case 1: Valid prescription ---
        console.print("\n[bold cyan]Case 1: Valid — Lisinopril 10 mg once daily[/]")
        mock_consensus = ConsensusResult(
            passed=True,
            medication_name="lisinopril",
            dose_value=10.0,
            dose_unit="mg",
            frequency="once daily",
            overall_score=1.0,
            field_scores={
                "medication_name": FieldConsensus(field="medication_name", agreed_value="lisinopril", score=1.0, unanimous=True, votes={"easyocr": "lisinopril", "paddleocr": "lisinopril", "llava": "lisinopril"}),
                "dose_value":      FieldConsensus(field="dose_value", agreed_value="10", score=1.0, unanimous=True, votes={"easyocr": "10", "paddleocr": "10", "llava": "10"}),
                "dose_unit":       FieldConsensus(field="dose_unit", agreed_value="mg", score=1.0, unanimous=True, votes={"easyocr": "mg", "paddleocr": "mg", "llava": "mg"}),
            },
            extractions=[
                ExtractedPrescription(engine="easyocr", medication_name="Lisinopril", dose_value=10.0, dose_unit="mg"),
                ExtractedPrescription(engine="paddleocr", medication_name="Lisinopril", dose_value=10.0, dose_unit="mg"),
                ExtractedPrescription(engine="llava", medication_name="Lisinopril", dose_value=10.0, dose_unit="mg"),
            ],
        )
        result1 = await vault.validate(mock_consensus)
        status = "[green]PASSED[/]" if result1.passed else "[red]FAILED[/]"
        console.print(f"  Status: {status}")
        if result1.known_strengths:
            console.print(f"  Known strengths: {', '.join(sorted({s.label for s in result1.known_strengths}))}")

        # --- Case 2: Clinical Impossibility ---
        console.print("\n[bold red]Case 2: Clinical Impossibility — Lisinopril 200 mg[/]")
        mock_impossible = mock_consensus.model_copy(update={"dose_value": 200.0})
        result2 = await vault.validate(mock_impossible)
        status2 = "[red]CLINICAL IMPOSSIBILITY[/]" if result2.clinical_impossibility else "[green]OK[/]"
        console.print(f"  Status: {status2}")
        if result2.impossibility_reason:
            console.print(f"  Reason: {result2.impossibility_reason}")

        # --- Case 3: Consensus Failure ---
        console.print("\n[bold yellow]Case 3: Consensus Failure — engines disagree on dose[/]")
        from pipeline.layer1_ocr_ensemble import OCREnsembleCouncil, _score_field
        from pipeline.models import ExtractedPrescription
        disagreeing = [
            ExtractedPrescription(engine="easyocr",   medication_name="Lisinopril", dose_value=5.0,  dose_unit="mg"),
            ExtractedPrescription(engine="paddleocr", medication_name="Lisinopril", dose_value=50.0, dose_unit="mg"),
            ExtractedPrescription(engine="llava",     medication_name="Lisinopril", dose_value=5.0,  dose_unit="mg"),
        ]
        fc = _score_field("dose_value", disagreeing)
        console.print(f"  dose_value consensus score: [yellow]{fc.score:.2f}[/] (threshold 1.0)")
        console.print(f"  Engine votes: { {e: v for e, v in fc.votes.items()} }")
        console.print("  → [yellow]RECAPTURE REQUIRED[/]")

    asyncio.run(_demo())
    console.rule()


if __name__ == "__main__":
    cli()
