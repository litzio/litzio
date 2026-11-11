#!/usr/bin/env python3
"""Validate a .reqif file against the official OMG reqif.xsd (libxml2 via lxml), with all schema imports local."""
import sys
from lxml import etree
xsd_dir = sys.argv[2] if len(sys.argv) > 2 else "/workspace/spike-req/xsd"
schema = etree.XMLSchema(etree.parse(f"{xsd_dir}/reqif.local.xsd"))
doc = etree.parse(sys.argv[1])
if schema.validate(doc):
    print("VALID", sys.argv[1]); sys.exit(0)
for e in schema.error_log: print(f"{e.line}: {e.message}")
sys.exit(1)
