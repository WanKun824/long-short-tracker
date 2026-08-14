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

test("recognizes a filer that still reports legacy values in thousands", () => {
  const xml = `<?xml version="1.0"?>
    <informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
      <infoTable><nameOfIssuer>AMAZON COM INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>023135106</cusip><value>892310</value><shrsOrPrnAmt><sshPrnamt>3743854</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
      <infoTable><nameOfIssuer>ALPHABET INC</nameOfIssuer><titleOfClass>CAP STK CL C</titleOfClass><cusip>02079K107</cusip><value>484744</value><shrsOrPrnAmt><sshPrnamt>1371931</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
    </informationTable>`;
  const rows = parseInformationTableXml(xml, [
    { ticker: "AMZN", issuer: "Amazon", class: "COM", cusip: "023135106", valueK: 649543, weight: 55, shares: 3118754, principal: null, option: null },
    { ticker: "GOOG", issuer: "Alphabet", class: "COM", cusip: "02079K107", valueK: 338819, weight: 45, shares: 1181131, principal: null, option: null },
  ]);

  assert.equal(rows[0].ticker, "AMZN");
  assert.equal(rows[0].valueK, 892310);
  assert.equal(rows[1].ticker, "GOOG");
  assert.equal(rows[1].valueK, 484744);
});
