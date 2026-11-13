"""
test_patients_mcp.py — Automated Test Script for the Patients MCP Server.

Calls each tool once via the official MCP stdio client and prints the result:
  1. search_patients(name="Sharma")     [READ]
  2. get_patient(patient_id=1)          [READ]
  3. get_patient_history(patient_id=1)  [READ]

Run from the `hospitalos/` directory:
  python mcp_servers/patients/test_patients_mcp.py
"""

import asyncio
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HOSPITALOS_ROOT = Path(__file__).resolve().parents[2]


async def main():
    server_script = str(HOSPITALOS_ROOT / "mcp_servers" / "patients" / "server.py")
    server_params = StdioServerParameters(command=sys.executable, args=[server_script])

    print("=== Testing HospitalOS-Patients MCP Server ===")
    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            tools = await session.list_tools()
            print(f"Discovered {len(tools.tools)} tools:")
            for t in tools.tools:
                first_line = (t.description or "").strip().splitlines()[0]
                print(f"  - {t.name}: {first_line}")

            print("\n1. Calling search_patients(name='Sharma')...")
            r1 = await session.call_tool("search_patients", arguments={"name": "Sharma"})
            print(r1.content[0].text)

            print("\n2. Calling get_patient(patient_id=1)...")
            r2 = await session.call_tool("get_patient", arguments={"patient_id": 1})
            print(r2.content[0].text)

            print("\n3. Calling get_patient_history(patient_id=1)...")
            r3 = await session.call_tool("get_patient_history", arguments={"patient_id": 1})
            print(r3.content[0].text)


if __name__ == "__main__":
    asyncio.run(main())
