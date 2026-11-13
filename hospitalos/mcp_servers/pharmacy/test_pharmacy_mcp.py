"""
test_pharmacy_mcp.py — Automated Test Script for the Pharmacy MCP Server.

Calls each tool once via the official MCP stdio client and prints the result:
  1. check_stock(medicine_name="Amoxicillin")                 [READ]
  2. list_low_stock(threshold=50)                             [READ]
  3. restock_medicine(medicine_name="Ceftriaxone", quantity=20) [WRITE]

Run from the `hospitalos/` directory:
  python mcp_servers/pharmacy/test_pharmacy_mcp.py
"""

import asyncio
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HOSPITALOS_ROOT = Path(__file__).resolve().parents[2]


async def main():
    server_script = str(HOSPITALOS_ROOT / "mcp_servers" / "pharmacy" / "server.py")
    server_params = StdioServerParameters(command=sys.executable, args=[server_script])

    print("=== Testing HospitalOS-Pharmacy MCP Server ===")
    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            tools = await session.list_tools()
            print(f"Discovered {len(tools.tools)} tools:")
            for t in tools.tools:
                first_line = (t.description or "").strip().splitlines()[0]
                print(f"  - {t.name}: {first_line}")

            print("\n1. Calling check_stock(medicine_name='Amoxicillin')...")
            r1 = await session.call_tool(
                "check_stock", arguments={"medicine_name": "Amoxicillin"}
            )
            print(r1.content[0].text)

            print("\n2. Calling list_low_stock(threshold=50)...")
            r2 = await session.call_tool("list_low_stock", arguments={"threshold": 50})
            print(r2.content[0].text)

            print("\n3. Calling restock_medicine(medicine_name='Ceftriaxone', quantity=20)...")
            r3 = await session.call_tool(
                "restock_medicine",
                arguments={"medicine_name": "Ceftriaxone", "quantity": 20},
            )
            print(r3.content[0].text)


if __name__ == "__main__":
    asyncio.run(main())
