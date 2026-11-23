from tests.conftest import make_pdf

NIT = [
    "NOTICE INVITING TENDER - SUPPLY OF SEAMLESS PIPES (DEMO)",
    "",
    "4. ELIGIBILITY CRITERIA",
    "4.1 The bidder must possess a valid GST registration and furnish the GST registration certificate.",
    "",
    "4.2 The bidder should have an average annual turnover of at least Rs. 2 crore during the last three financial years.",
    "",
    "4.3 The bidder must have successfully executed at least two similar supply orders, each of value not less than Rs. 50 lakh,",
    "in the last five years.",
    "",
    "4.4 Bidders claiming MSE exemption must submit a valid Udyam registration certificate.",
    "",
    "4.5 The bidder shall submit a declaration under GFR Rule 144 (xi) regarding sharing a land border with India.",
    "",
    "4.6 The bidder has not been blacklisted or debarred by any government organisation.",
    "",
    "5. The meeting will be held in the conference room at 11 AM.",
]


def extract(client, H, lines, name="nit.pdf"):
    r = client.post("/v1/tender/extract", json={"filePath": make_pdf(name, [lines]), "tenderId": "t1"}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def test_nit_candidates_have_rules_sources_and_are_conservative(client, H):
    j = extract(client, H, NIT)
    by_rule = {(c["rule"].get("type"), c["rule"].get("docType") or c["rule"].get("declarationCode")): c for c in j["candidates"]}
    t = by_rule[("numeric_min", "FINANCIAL_STATEMENT")]
    assert t["rule"]["min"] == 2 and t["rule"]["unit"] == "INR_CRORE" and t["rule"]["years"] == 3 and t["rule"]["aggregate"] == "average" and t["type"] == "FINANCIAL"
    e = by_rule[("count_min", "EXPERIENCE_LETTER")]
    assert e["rule"]["minCount"] == 2 and e["rule"]["minValue"] == 5000000 and e["rule"]["sinceYears"] == 5
    assert ("document_present", "GST_CERTIFICATE") in by_rule
    u = by_rule[("document_present", "UDYAM_CERTIFICATE")]
    assert u["mandatory"] is False, "'claiming exemption' clauses are optional"
    assert ("declaration_present", "LAND_BORDER_144XI") in by_rule and ("declaration_present", "NOT_BLACKLISTED") in by_rule
    assert all(c["sourcePage"] == 1 and c["text"] and 0 < c["confidence"] <= 1 for c in j["candidates"])
    assert [c["code"] for c in j["candidates"]] == [f"REQ-{i:02d}" for i in range(1, len(j["candidates"]) + 1)]
    assert not any("conference" in c["text"].lower() for c in j["candidates"]), "irrelevant clause must not become a requirement"


def test_missing_parameters_are_left_for_the_officer(client, H):
    j = extract(client, H, ["4.2 The bidder should have adequate annual turnover to execute the work."], "nit2.pdf")
    c = j["candidates"][0]
    assert c["rule"] == {} and c["needsOfficerInput"] is True and c["confidence"] < 0.5


def test_no_clauses_gives_warning_not_fabrication(client, H):
    j = extract(client, H, ["General information only.", "Contact the procurement office."], "nit3.pdf")
    assert j["candidates"] == [] and any(w.startswith("NO_CANDIDATES") for w in j["warnings"])


def F(doc, dtype, name, v):
    return {"docId": doc, "docType": dtype, "fieldName": name, "rawValue": v, "normalizedValue": v}


def cons(client, H, fields, profile=None):
    r = client.post("/v1/consistency", json={"fields": fields, "orgProfile": profile}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()["findings"]


def test_name_variants_probable_vs_real_mismatch(client, H):
    prof = {"legalName": "Sample Fabricators Private Limited", "gstin": "29AABCS1234F1ZN", "pan": "AABCS1234F"}
    f = cons(client, H, [F("a", "GST_CERTIFICATE", "legal_name", "SAMPLE FABRICATORS PVT. LTD."),
                         F("b", "UDYAM_CERTIFICATE", "legal_name", "Sample Fabricators Pvt Ltd"),
                         F("c", "PAN_CARD", "legal_name", "Rama Engineering Works")], prof)
    v = {x["fieldA"]["docId"]: x["verdict"] for x in f if x["type"] == "legal_name"}
    assert v["a"] == "MATCH" and v["b"] == "MATCH" and v["c"] == "MISMATCH"


def test_gstin_pan_exactness_and_embedded_pan(client, H):
    prof = {"gstin": "29AABCS1234F1ZN", "pan": "AABCS1234F"}
    f = cons(client, H, [F("a", "GST_CERTIFICATE", "gstin", "29AABCS1234F1ZN"), F("b", "TURNOVER_CERTIFICATE", "gstin", "29AABCS1234G1ZM"),
                         F("c", "PAN_CARD", "pan", "AABCS1234F"), F("d", "UDYAM_CERTIFICATE", "pan", "AABCS1234G")], prof)
    g = {x["fieldA"]["docId"]: x["verdict"] for x in f if x["type"] == "gstin"}
    p = {x["fieldA"]["docId"]: x["verdict"] for x in f if x["type"] == "pan"}
    assert g == {"a": "MATCH", "b": "MISMATCH"} and p == {"c": "MATCH", "d": "MISMATCH"}
    emb = {x["fieldA"]["docId"]: x["verdict"] for x in f if x["type"] == "pan_in_gstin"}
    assert emb["a"] == "MATCH" and emb["b"] == "MISMATCH"


def test_single_source_is_insufficient_data_not_a_pass(client, H):
    f = cons(client, H, [F("a", "GST_CERTIFICATE", "legal_name", "Sample Fabricators Private Limited")])
    assert [x["verdict"] for x in f] == ["INSUFFICIENT_DATA"]
    assert cons(client, H, []) == []


def test_address_abbreviation_tolerance(client, H):
    f = cons(client, H, [F("a", "GST_CERTIFICATE", "address", "Plot 12, Industrial Estate Phase II, Sample City"),
                         F("b", "UDYAM_CERTIFICATE", "address", "Plot No 12 Ind. Est. Ph II Sample City")],
             {"address": "Plot 12, Industrial Estate Phase II, Sample City"})
    assert {x["fieldA"]["docId"]: x["verdict"] for x in f}["a"] == "MATCH"
    assert {x["fieldA"]["docId"]: x["verdict"] for x in f}["b"] in ("MATCH", "PROBABLE_MATCH")
