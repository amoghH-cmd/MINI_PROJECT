"""Generates FICTIONAL sample documents for demos and tests. Nothing here is a real tender, company or identifier:
GSTINs are checksum-valid but registered to no one. Run:  python generate_samples.py   (needs: pymupdf, pillow)"""
import io, shutil, sys, textwrap
from pathlib import Path
import fitz
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ai-service"))
from services.validators import gstin_check_char  # noqa: E402

OUT = Path(__file__).parent / "pdfs"
NOTE = "SAMPLE DOCUMENT - FICTIONAL DATA FOR DEMONSTRATION ONLY"


def gstin(state, pan):
    first = f"{state}{pan}1Z"
    return first + gstin_check_char(first)


def pdf(path, lines, size=11):
    path.parent.mkdir(parents=True, exist_ok=True)
    d = fitz.open(); pg = d.new_page(); y = 60
    pg.insert_text((60, 36), NOTE, fontsize=7, color=(0.5, 0.1, 0.1))
    for raw in lines:
        for ln in (textwrap.wrap(raw, 88) or [""]):
            if y > 760:
                pg = d.new_page(); y = 60
            pg.insert_text((60, y), ln, fontsize=size); y += size + 6
    d.set_metadata({"producer": "BCVP sample generator", "creator": "BCVP sample generator"})
    d.save(path); d.close()


def scan(path, lines):
    img = Image.new("L", (1700, 2200), 255); dr = ImageDraw.Draw(img); f = ImageFont.load_default(size=34); y = 160
    dr.text((140, 70), NOTE, fill=90, font=ImageFont.load_default(size=22))
    for ln in lines:
        dr.text((140, y), ln, fill=0, font=f); y += 62
    img = img.rotate(1.2, fillcolor=255)
    b = io.BytesIO(); img.save(b, "PNG")
    d = fitz.open(); pg = d.new_page(width=612, height=792); pg.insert_image(pg.rect, stream=b.getvalue()); path.parent.mkdir(parents=True, exist_ok=True); d.save(path); d.close()


def pack(folder, org):
    n, pan, g = org["name"], org["pan"], org["gstin"]
    pdf(folder / "gst_certificate.pdf", ["FORM GST REG-06", "Registration Certificate", f"Legal Name: {org['gst_name']}", f"GSTIN: {g}", "Date of Liability: 01/04/2019",
        "Valid From: 01/04/2019    Valid Upto: Not Applicable", f"Address: {org['addr']}"])
    pdf(folder / "pan_card.pdf", ["INCOME TAX DEPARTMENT", "Permanent Account Number Card", f"Name: {org['pan_name']}", f"Permanent Account Number: {org['pan_doc']}"])
    pdf(folder / "incorporation.pdf", ["Certificate of Incorporation", "Registrar of Companies", f"Name of Company: {org['inc_name']}", f"Corporate Identity Number: {org['cin']}", "Date of Incorporation: 12 March 2019"])
    pdf(folder / "udyam.pdf", ["UDYAM REGISTRATION CERTIFICATE", f"Name of Enterprise: {org['udyam_name']}", f"Udyam Registration Number: {org['udyam']}", f"PAN: {org['pan_doc']}",
        f"Valid Upto: {org['udyam_valid']}", f"Address: {org['addr']}"])
    lines = ["Balance Sheet and Statement of Profit and Loss", "(Amount in Rs. lakhs)"]
    for fy, v in org["turnover"].items():
        lines += [f"For the year ended FY {fy}", f"Revenue from operations   {v:,.2f}"]
    lines += ["Independent Auditor's Report on the Financial Statements"]
    pdf(folder / "financial_statements.pdf", lines)
    for i, (when, val) in enumerate(org["orders"], 1):
        pdf(folder / f"experience_{i}.pdf", ["Completion Certificate", f"Work order dated {when[0]} satisfactorily completed", f"Order Value: Rs. {val:,}", f"Date of Completion: {when[1]}"])
    if org["declaration"]:
        pdf(folder / "declaration_land_border.pdf", ["DECLARATION", "I hereby declare that the bidder is not from a country sharing a land border with India", "as per GFR Rule 144 (xi) and the order of the Ministry of Finance.", "Signed: Authorised Signatory"])
    cr = org["turnover"]["2023-24"] / 100   # lakh -> crore, consistent with the financial statements
    scan(folder / "turnover_certificate_scan.pdf", ["Turnover Certificate", f"Name: {org['name']}", "This is to certify that the annual turnover", f"for FY 2023-24 was Rs. {cr:.2f} crore", "Chartered Accountant"])


tender = OUT / "tender"
pdf(tender / "nit_seamless_pipes.pdf", [
    "NOTICE INVITING TENDER (FICTIONAL)", "Supply of Seamless Carbon Steel Pipes - Tender No. BCVP/DEMO/MM/2026/014", "", "4. ELIGIBILITY CRITERIA",
    "4.1 The bidder must possess a valid GST registration and furnish the GST registration certificate.", "",
    "4.2 The bidder should have an average annual turnover of at least Rs. 2 crore during the last three financial years.", "",
    "4.3 The bidder must have successfully executed at least two similar supply orders, each of value not less than Rs. 50 lakh, in the last five years.", "",
    "4.4 Bidders claiming MSE exemption must submit a valid Udyam registration certificate.", "",
    "4.5 The bidder shall submit a declaration under GFR Rule 144 (xi) regarding sharing a land border with India.", "",
    "4.6 The bidder shall furnish a copy of the PAN card and the certificate of incorporation or registration.", "",
    "5. The pre-bid meeting will be held in the conference room at 11 AM."])

A = dict(name="Sample Fabricators Private Limited", gst_name="Sample Fabricators Private Limited", pan_name="SAMPLE FABRICATORS PRIVATE LIMITED", inc_name="Sample Fabricators Pvt. Ltd.",
         udyam_name="Sample Fabricators Pvt Ltd", pan="AABCS1234F", pan_doc="AABCS1234F", gstin=gstin("29", "AABCS1234F"), cin="U12345KA2019PTC123456", udyam="UDYAM-KA-03-0012345",
         udyam_valid="31/03/2030", addr="Plot 12, Industrial Estate Phase II, Sample City, Karnataka 560001",
         turnover={"2023-24": 450.0, "2022-23": 410.0, "2021-22": 380.0}, orders=[(("12/03/2022", "30/11/2022"), 6250000), (("05/08/2023", "20/02/2024"), 7400000)], declaration=True)
B = dict(name="Second Engineering Works LLP", gst_name="Second Engineering Works LLP", pan_name="RAMA ENGINEERING WORKS", inc_name="Second Engineering Works LLP",
         udyam_name="Second Engineering Works", pan="AAGCT5678K", pan_doc="AAGCT5678L", gstin=gstin("27", "AAGCT5678K"), cin="U98765MH2018PTC654321", udyam="UDYAM-MH-12-0054321",
         udyam_valid="31/03/2025", addr="Gala 4, Midc Road, Sample Town, Maharashtra 400001",
         turnover={"2023-24": 140.0, "2022-23": 120.0, "2021-22": 100.0}, orders=[(("02/02/2023", "15/09/2023"), 5800000)], declaration=False)
pack(OUT / "bidder_a_sample_fabricators", A)
pack(OUT / "bidder_b_second_engineering", B)
# Exact duplicate across bidders: B submits a byte-identical copy of A's first experience letter
shutil.copy(OUT / "bidder_a_sample_fabricators" / "experience_1.pdf", OUT / "bidder_b_second_engineering" / "experience_2_duplicate_of_A.pdf")
(OUT / "README.txt").write_text(f"{NOTE}\nBidder A: passes most requirements.\nBidder B: PAN mismatch, name variant, expired Udyam (31/03/2025), low turnover, one work order, no declaration, one file duplicated from A.\n"
                                f"GSTIN A={A['gstin']}  GSTIN B={B['gstin']} (checksum-valid, registered to nobody)\n")
print("written to", OUT, "| A:", A["gstin"], "B:", B["gstin"])
