"""Disposable-only, reproducible DB-21 read measurement (never a hosted connection)."""

import json
import re
import subprocess
import sys
from pathlib import Path

container = sys.argv[1]
if re.fullmatch(r"decamark-baseline-[0-9]+", container) is None:
    raise ValueError("Only the disposable baseline harness is allowed")
root = Path(__file__).resolve().parents[1]


def sql(statement: str) -> str:
    return subprocess.run(
        ["docker", "exec", "-i", container, "psql", "-XAtq", "-h", "/tmp", "-U", "postgres",
         "-v", "ON_ERROR_STOP=1"], input=statement, text=True, capture_output=True, check=True,
    ).stdout.strip()


sql("""
GRANT fieldmaps_api TO postgres WITH SET TRUE;
INSERT INTO auth.users(id) VALUES ('66000000-0000-4000-8000-000000000010');
INSERT INTO fieldmaps.profiles(user_id) VALUES ('66000000-0000-4000-8000-000000000010');
INSERT INTO fieldmaps.project_memberships(user_id,organization_id,project_id,role)
VALUES ('66000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','manager');
INSERT INTO fieldmaps.library_variables(level,organization_id,project_id,code,group_name,section,settings)
SELECT 'project','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
 'Benchmark'||n,'Synthetic stress','Record',
 jsonb_build_object('label','Synthetic stress '||n,'kind','text','exportColumn','bench_'||n,'source','Synthetic benchmark')
FROM generate_series(1,5690)n;
INSERT INTO fieldmaps.forms(id,organization_id,project_id,code,name)
VALUES ('66000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000002','library-benchmark','Synthetic benchmark');
INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,form_id,code,version,state,definition)
SELECT gen_random_uuid(),'10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
 '66000000-0000-4000-8000-000000000001','library-benchmark-'||n,n,'draft',
 jsonb_build_object('questions',(SELECT jsonb_agg(jsonb_build_object('id','q'||q,
 'librarySource',jsonb_build_object('variableId',(SELECT id::text FROM fieldmaps.library_variables WHERE level='universal' ORDER BY id LIMIT 1))))
 FROM generate_series(1,100)q)) FROM generate_series(1,10000)n;
ANALYZE fieldmaps.library_variables;
ANALYZE fieldmaps.form_versions;
""")
query = (root / "backend/src/fieldmaps_api/queries/library.sql").read_text().replace(
    ":org", "'10000000-0000-4000-8000-000000000001'::uuid").replace(
    ":project", "'10000000-0000-4000-8000-000000000002'::uuid")
prefix = "BEGIN; SET LOCAL ROLE fieldmaps_api; SET LOCAL fieldmaps.user_id='66000000-0000-4000-8000-000000000010';"
payload = sql(prefix + query + "; ROLLBACK;")
assert len(json.loads(payload)["variables"]) == 5700
plans = [json.loads(sql(prefix + "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + query + "; ROLLBACK;")) for _ in range(6)]
read_times = sorted(p[0]["Execution Time"] for p in plans[1:])
report = {"variables":5700,"fixture_versions":10000,"questions_per_version":100,
          "samples":5,"db_execution_ms_p95":read_times[-1],"db_response_bytes":len(payload.encode()),
          "usage_source":"Direct SQL fixture tags, not API-authored tags (BE-28 pending)"}
print(json.dumps(report,indent=2))
Path("/tmp/library-read-explain.json").write_text(json.dumps(plans[-1],indent=2))
