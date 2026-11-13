"""
test_lab_mcp.py — Automated Test Script for the Lab MCP Server.

Calls each tool once via the official MCP stdio client and prints the result:
  1. list_pending_tests()                                           [READ]
  2. get_results(patient_id=1)                                      [READ]
  3. order_test(patient_id=2, test_name="Arterial Blood Gas Panel") [WRITE]

Run from the `hospitalos/` directory:
  python mcp_servers/lab/test_lab_mcp.py
"""

import asyncio
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HOSPITALOS_ROOT = Path(__file__).resolve().parents[2]


async def main():
    server_script = str(HOSPITALOS_ROOT / "mcp_servers" / "lab" / "server.py")
    server_params = StdioServerParameters(command=sys.executable, args=[server_script])

    print("=== Testing HospitalOS-Lab MCP Server ===")
    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            tools = await session.list_tools()
            print(f"Discovered {len(tools.tools)} tools:")
            for t in tools.tools:
                first_line = (t.description or "").strip().splitlines()[0]
                print(f"  - {t.name}: {first_line}")

            print("\n1. Calling list_pending_tests()...")
            r1 = await session.call_tool("list_pending_tests", arguments={})
            print(r1.content[0].text)

            print("\n2. Calling get_results(patient_id=1)...")
            r2 = await session.call_tool("get_results", arguments={"patient_id": 1})
            print(r2.content[0].text)

            print("\n3. Calling order_test(patient_id=2, test_name='Arterial Blood Gas Panel')...")
            r3 = await session.call_tool(
                "order_test",
                arguments={"patient_id": 2, "test_name": "Arterial Blood Gas Panel"},
            )
            print(r3.content[0].text)


if __name__ == "__main__":
    asyncio.run(main())
