"""
test_beds_mcp.py — Automated Test Script for the Beds MCP Server.

Calls each tool once via the official MCP stdio client and prints the result:
  1. get_free_beds("ICU")                [READ]
  2. admit_patient(patient_id=3, ward="ICU") [WRITE]
  3. discharge_patient(patient_id=3)     [WRITE]

Run from the `hospitalos/` directory:
  python mcp_servers/beds/test_beds_mcp.py
"""

import asyncio
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HOSPITALOS_ROOT = Path(__file__).resolve().parents[2]


async def main():
    server_script = str(HOSPITALOS_ROOT / "mcp_servers" / "beds" / "server.py")
    server_params = StdioServerParameters(command=sys.executable, args=[server_script])

    print("=== Testing HospitalOS-Beds MCP Server ===")
    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            tools = await session.list_tools()
            print(f"Discovered {len(tools.tools)} tools:")
            for t in tools.tools:
                first_line = (t.description or "").strip().splitlines()[0]
                print(f"  - {t.name}: {first_line}")

            print("\n1. Calling get_free_beds(ward='ICU')...")
            r1 = await session.call_tool("get_free_beds", arguments={"ward": "ICU"})
            print(r1.content[0].text)

            print("\n2. Calling admit_patient(patient_id=3, ward='ICU')...")
            r2 = await session.call_tool(
                "admit_patient", arguments={"patient_id": 3, "ward": "ICU"}
            )
            print(r2.content[0].text)

            print("\n3. Calling discharge_patient(patient_id=3)...")
            r3 = await session.call_tool(
                "discharge_patient", arguments={"patient_id": 3}
            )
            print(r3.content[0].text)


if __name__ == "__main__":
    asyncio.run(main())
