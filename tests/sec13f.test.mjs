import assert from "node:assert/strict";
import test from "node:test";
import { parseInformationTableXml } from "../app/lib/sec13f.ts";

test("parses and aggregates an original SEC 13F information table", () => {
  const xml = `<?xml version="1.0"?>
    <informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
      <infoTable><nameOfIssuer>ALPHA &amp; CO</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>000000001</cusip><value>2500000</value><shrsOrPrnAmt><sshPrnamt>1000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
      <infoTable><nameOfIssuer>ALPHA &amp; CO</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>000000001</cusip><value>500000</value><shrsOrPrnAmt><sshPrnamt>200</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
      <infoTable><nameOfIssuer>BETA</nameOfIssuer><titleOfClass>PUT</titleOfClass><cusip>000000002</cusip><value>1000000</value><shrsOrPrnAmt><sshPrnamt>50</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><putCall>PUT</putCall></infoTable>
    </informationTable>`;
  const rows = parseInformationTableXml(xml, [{
    ticker: "ALP", issuer: "Alpha", class: "COM", cusip: "000000001", valueK: 1,
    weight: 1, shares: 1, principal: null, option: null,
  }]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].ticker, "ALP");
  assert.equal(rows[0].issuer, "ALPHA & CO");
  assert.equal(rows[0].valueK, 3000);
  assert.equal(rows[0].shares, 1200);
  assert.equal(rows[0].weight, 75);
  assert.equal(rows[1].ticker, "000000002");
  assert.equal(rows[1].option, "PUT");
});
