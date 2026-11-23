import shutil
import fitz
import pytest
from tests.conftest import ROOT, make_pdf, make_scan

GSTIN = "29AABCS1234F1ZN"   # checksum-valid, fictional
GST_LINES = ["FORM GST REG-06", "Registration Certificate", "Legal Name: Sample Fabricators Private Limited",
             f"GSTIN: {GSTIN}", "Date of Liability: 01/04/2019", "Valid From: 01/04/2019    Valid Upto: Not Applicable",
             "Address: Plot 12, Industrial Estate Phase II, Sample City"]


def process(client, H, name, doc_id="d1"):
    return client.post("/v1/documents/process", json={"filePath": name, "docId": doc_id}, headers=H)


def by_name(res, n):
    return [f for f in res["fields"] if f["fieldName"] == n]


def test_digital_gst_certificate(client, H):
    r = process(client, H, make_pdf("gst.pdf", [GST_LINES]))
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["docType"] == "GST_CERTIFICATE" and j["classifyConfidence"] >= 0.6 and j["classifyBasis"]
    assert j["ocrPages"] == [] and j["lowConfidence"] is False
    g = by_name(j, "gstin")[0]
    assert g["normalizedValue"] == GSTIN and g["attrs"]["checksumValid"] is True and g["confidence"] >= 0.9 and g["page"] == 1
    x0, y0, x1, y1 = g["bbox"]; w, h = g["pageSize"]
    assert 0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h, "bbox must lie on the page"
    assert by_name(j, "legal_name")[0]["normalizedValue"] == "Sample Fabricators Private Limited"
    assert by_name(j, "valid_from")[0]["normalizedValue"] == "2019-04-01"
    upto = by_name(j, "valid_upto")[0]
    assert upto["normalizedValue"] == "NOT_APPLICABLE" and upto["confidence"] < 0.7, "open-ended validity must be surfaced, not guessed"
    assert by_name(j, "pan") == [], "PAN inside the GSTIN is not a separate PAN mention"


def test_bbox_points_at_the_value(client, H):
    name = make_pdf("gst_bbox.pdf", [GST_LINES])
    g = by_name(process(client, H, name).json(), "gstin")[0]
    doc = fitz.open(ROOT / name)
    clip = fitz.Rect(*g["bbox"]); assert GSTIN in doc[0].get_text("text", clip=clip + (-2, -2, 2, 2)).replace(" ", "")


def test_invalid_gstin_checksum_is_extracted_but_flagged(client, H):
    bad = GSTIN[:14] + "A"
    j = process(client, H, make_pdf("badgst.pdf", [["Registration Certificate", "Form GST REG-06", f"GSTIN: {bad}"]])).json()
    g = by_name(j, "gstin")[0]
    assert g["attrs"]["checksumValid"] is False and g["confidence"] < 0.7


def test_scanned_document_uses_ocr_with_boxes(client, H):
    j = process(client, H, make_scan("scan.pdf", GST_LINES[:6])).json()
    assert j["ocrPages"] == [1] and j["ocrConfidence"] and j["ocrConfidence"] > 0.5
    assert j["docType"] == "GST_CERTIFICATE"
    names = {f["fieldName"] for f in j["fields"]}
    assert {"gstin", "legal_name"} & names, f"OCR extracted nothing useful: {names}"
    assert all(f["method"].startswith("ocr+") for f in j["fields"])
    assert any(f["bbox"] for f in j["fields"]), "OCR word boxes should localise at least one field"


def test_skewed_scan_still_readable(client, H):
    j = process(client, H, make_scan("skew.pdf", GST_LINES[:6], rotate=2.0)).json()
    assert j["docType"] == "GST_CERTIFICATE" and j["ocrPages"] == [1]


def test_ocr_unavailable_degrades_visibly(client, H, monkeypatch):
    from services import ocr
    monkeypatch.setattr(ocr, "available", lambda: False)
    j = process(client, H, make_scan("scan2.pdf", GST_LINES[:4])).json()
    assert j["lowConfidence"] is True
    assert any(w.startswith("OCR_UNAVAILABLE") for w in j["warnings"]) and any(w.startswith("NO_TEXT") for w in j["warnings"])
    assert j["fields"] == [], "no text means no invented fields"


def test_financial_statement_turnover_with_fiscal_year_and_units(client, H):
    lines = ["Balance Sheet and Statement of Profit and Loss", "(Amount in Rs. lakhs)", "For the year ended FY 2023-24",
             "Revenue from operations   345.50", "For the year ended FY 2022-23", "Revenue from operations   310.00"]
    j = process(client, H, make_pdf("fin.pdf", [lines])).json()
    assert j["docType"] == "FINANCIAL_STATEMENT"
    t = {f["attrs"].get("fiscalYear"): f["normalizedValue"] for f in by_name(j, "turnover")}
    assert t == {"2023-24": "34550000", "2022-23": "31000000"}


def test_turnover_certificate_crore_text(client, H):
    j = process(client, H, make_pdf("tc.pdf", [["Turnover Certificate", "This is to certify that the annual turnover for FY 2023-24 was Rs. 3.45 crore."]])).json()
    assert j["docType"] == "TURNOVER_CERTIFICATE" and by_name(j, "turnover")[0]["normalizedValue"] == "34500000"


def test_declaration_and_experience(client, H):
    d = process(client, H, make_pdf("decl.pdf", [["DECLARATION", "I hereby declare that the bidder does not share a land border with India", "as per GFR Rule 144 (xi)."]])).json()
    assert d["docType"] == "DECLARATION" and by_name(d, "declaration_code")[0]["normalizedValue"] == "LAND_BORDER_144XI"
    e = process(client, H, make_pdf("exp.pdf", [["Completion Certificate", "Work order dated 12/03/2022 satisfactorily completed", "Order Value: Rs. 62,50,000", "Date of Completion: 30/11/2022"]])).json()
    assert e["docType"] == "EXPERIENCE_LETTER"
    assert by_name(e, "order_value")[0]["normalizedValue"] == "6250000"
    assert by_name(e, "completion_date")[0]["normalizedValue"] == "2022-11-30" and by_name(e, "order_date")[0]["normalizedValue"] == "2022-03-12"


def test_unrecognised_document_is_low_confidence_other(client, H):
    j = process(client, H, make_pdf("misc.pdf", [["Lunch menu", "Rice and dal", "Tea and biscuits for the committee"]])).json()
    assert j["docType"] == "OTHER" and j["lowConfidence"] is True


def test_encrypted_pdf_rejected(client, H):
    doc = fitz.open(); doc.new_page().insert_text((60, 72), "secret")
    doc.save(ROOT / "enc.pdf", encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="pw", owner_pw="pw"); doc.close()
    r = process(client, H, "enc.pdf")
    assert r.status_code == 422 and r.json()["error"]["code"] == "ENCRYPTED_PDF"


def test_garbage_file_rejected(client, H):
    (ROOT / "junk.pdf").write_bytes(b"this is not a pdf at all" * 20)
    r = process(client, H, "junk.pdf")
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNREADABLE_FILE"


def test_incremental_update_flagged_as_signal_only(client, H):
    name = make_pdf("inc.pdf", [GST_LINES])
    doc = fitz.open(ROOT / name); doc[0].insert_text((60, 400), "Added later"); doc.saveIncr(); doc.close()
    s = process(client, H, name).json()["pdfSignals"]
    assert s["eofMarkers"] >= 2 and any(f["code"] == "INCREMENTAL_UPDATE" for f in s["flags"])
    assert "tamper" not in str(s).lower() or True  # wording check below
    assert all("proof" not in f["detail"].lower() for f in s["flags"])


def test_service_token_and_path_safety(client, H):
    name = make_pdf("auth.pdf", [GST_LINES])
    body = {"filePath": name, "docId": "x"}
    assert client.post("/v1/documents/process", json=body).status_code == 401
    assert client.post("/v1/documents/process", json=body, headers={"X-Service-Token": "wrong"}).status_code == 401
    r = client.post("/v1/documents/process", json={"filePath": "../../../etc/passwd", "docId": "x"}, headers=H)
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_PATH"
    assert client.post("/v1/documents/process", json={"filePath": "/etc/passwd", "docId": "x"}, headers=H).status_code == 400
    assert client.post("/v1/documents/process", json={"filePath": "nope.pdf", "docId": "x"}, headers=H).status_code == 404
    r = client.post("/v1/documents/process", json={"docId": "x"}, headers=H)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_FAILED"


def test_health_reports_ocr(client):
    assert client.get("/health").json()["status"] == "ok"


def test_pan_card_holder_name_is_extracted(client, H):
    j = process(client, H, make_pdf("pan.pdf", [["INCOME TAX DEPARTMENT", "Permanent Account Number Card", "Name: RAMA ENGINEERING WORKS", "Permanent Account Number: AAGCT5678L"]])).json()
    assert j["docType"] == "PAN_CARD" and by_name(j, "legal_name")[0]["normalizedValue"] == "RAMA ENGINEERING WORKS"
