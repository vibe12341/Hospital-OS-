"""
test_billing_mcp.py — Automated Test Script for the Billing MCP Server.

Calls each tool once via the official MCP stdio client and prints the result:
  1. get_bill(patient_id=1)     [READ]
  2. list_unpaid_bills()        [READ]
  3. mark_bill_paid(bill_id=2)  [WRITE]

Run from the `hospitalos/` directory:
  python mcp_servers/billing/test_billing_mcp.py
"""

import asyncio
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HOSPITALOS_ROOT = Path(__file__).resolve().parents[2]


async def main():
    server_script = str(HOSPITALOS_ROOT / "mcp_servers" / "billing" / "server.py")
    server_params = StdioServerParameters(command=sys.executable, args=[server_script])

    print("=== Testing HospitalOS-Billing MCP Server ===")
    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            tools = await session.list_tools()
            print(f"Discovered {len(tools.tools)} tools:")
            for t in tools.tools:
                first_line = (t.description or "").strip().splitlines()[0]
                print(f"  - {t.name}: {first_line}")

            print("\n1. Calling get_bill(patient_id=1)...")
            r1 = await session.call_tool("get_bill", arguments={"patient_id": 1})
            print(r1.content[0].text)

            print("\n2. Calling list_unpaid_bills()...")
            r2 = await session.call_tool("list_unpaid_bills", arguments={})
            print(r2.content[0].text)

            print("\n3. Calling mark_bill_paid(bill_id=2)...")
            r3 = await session.call_tool("mark_bill_paid", arguments={"bill_id": 2})
            print(r3.content[0].text)


if __name__ == "__main__":
    asyncio.run(main())
