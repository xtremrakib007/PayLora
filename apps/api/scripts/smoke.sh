#!/usr/bin/env bash
# End-to-end smoke test against a running API seeded with --demo data.
# Usage: API=http://localhost:3000 bash scripts/smoke.sh
set -u
P=$(date +%Y-%m)
B=${API:-http://localhost:3000}/api
login() { curl -s -X POST $B/auth/login -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"Demo1234!\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token'; }
OWN=$(login owner@demo.test); HR=$(login hr@demo.test); MGR=$(login manager@demo.test); STF=$(login staff@demo.test)
g() { curl -s -w ' [%{http_code}]' -H "authorization: Bearer $1" "$B$2"; echo; }
p() { curl -s -w ' [%{http_code}]' -X ${4:-POST} -H "authorization: Bearer $1" -H 'content-type: application/json' "$B$2" -d "$3"; echo; }
short() { cut -c1-220; }
echo "== me"; g $STF /auth/me | short
echo "== home staff"; g $STF /home | short
echo "== home owner"; g $OWN /home | cut -c1-300
echo "== employees (staff directory, no salary?)"; g $STF /employees | grep -o basicSalary | head -1; echo "(empty = hidden)"
echo "== employees owner"; g $OWN /employees | grep -o basicSalary | head -1
echo "== clock in"; p $STF /me/attendance/clock '{"action":"in","lat":3.1580,"lng":101.7124,"accuracy":10}' | short
echo "== clock in again"; p $STF /me/attendance/clock '{"action":"in"}' | short
echo "== clock out"; p $STF /me/attendance/clock '{"action":"out","lat":3.1580,"lng":101.7124}' | short
echo "== attendance day (mgr sees reports)"; g $MGR /attendance | node -pe 'const j=JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,""));j.rows.map(r=>r.employee.name).join(", ")'
echo "== leave types"; LT=$(g $STF /company/leave-types | node -pe 'JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,"")).find(t=>t.name.startsWith("Annual")).id'); echo $LT
echo "== staff apply leave"; p $STF /leave/requests "{\"leaveTypeId\":\"$LT\",\"fromDate\":\"2027-03-08\",\"toDate\":\"2027-03-09\",\"reason\":\"test\"}" | short
LID=$(g $MGR '/leave/requests?status=PENDING' | node -pe 'JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,"")).find(r=>r.reason==="test").id')
echo "== staff cannot approve own"; p $STF /leave/requests/$LID/decision '{"status":"APPROVED"}' PATCH | short
echo "== manager approves"; p $MGR /leave/requests/$LID/decision '{"status":"APPROVED"}' PATCH | short
echo "== my balances"; g $STF /leave/my-balances | short
echo "== claims staff"; p $STF /claims '{"category":"Travel","date":"2026-11-10","amount":42.5,"description":"Grab"}' | short
echo "== payroll staff forbidden"; g $STF /payroll/runs | short
echo "== payroll generate"; p $HR /payroll/runs/$P/generate '{}' | cut -c1-120
g $HR /payroll/runs/$P | node -pe 'const j=JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,""));JSON.stringify(j.totals)'
EID=$(g $HR /payroll/runs/$P | node -pe 'JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,"")).payslips[0].employeeId')
echo "== adjust"; p $HR /payroll/runs/$P/payslips/$EID '{"bonus":500,"note":"Q bonus"}' PATCH | cut -c1-100
echo "== finalize"; p $HR /payroll/runs/$P/status '{"status":"FINALIZED"}' | cut -c1-100
echo "== staff payslips"; SID=$(g $STF /payslips/mine | node -pe 'const j=JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,""));console.error("count",j.length);j[0].id'); echo $SID
curl -s -o /tmp/e2e/slip.pdf -w 'pdf %{http_code} %{content_type} %{size_download}\n' -H "authorization: Bearer $STF" $B/payslips/$SID/pdf
curl -s -o /tmp/e2e/all.pdf -w 'all pdf %{http_code} %{size_download}\n' -H "authorization: Bearer $HR" $B/payroll/runs/$P/payslips.pdf
curl -s -w ' %{http_code}\n' -H "authorization: Bearer $HR" $B/payroll/runs/$P/bank.csv | head -3
echo "== notifications staff"; g $STF /notifications | node -pe 'JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,"")).map(n=>n.title).join(" | ")'
echo "== tasks staff"; g $STF /tasks | node -pe 'JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,"")).map(t=>t.title+":"+t.status).join(" | ")'
TID=$(g $STF /tasks | node -pe 'JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,""))[0].id')
echo "== staff completes task"; p $STF /tasks/$TID '{"status":"DONE","title":"hacked"}' PATCH | short
echo "== meetings staff"; g $STF /meetings | node -pe 'JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,"")).map(m=>m.title+":"+m.myResponse).join(" | ")'
MID=$(g $STF /meetings | node -pe 'JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,""))[0].id')
p $STF /meetings/$MID/respond '{"response":"ACCEPTED"}' | short
echo "== create meeting"; PEOPLE=$(g $MGR /meetings/people | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,"")).map(p=>p.userId))'); p $MGR /meetings "{\"title\":\"Safety briefing\",\"startAt\":\"2026-11-20T02:00:00Z\",\"endAt\":\"2026-11-20T03:00:00Z\",\"attendeeUserIds\":$PEOPLE}" | short
echo "== feed"; g $STF /feed | cut -c1-150; p $STF /feed '{"content":"Hello team!"}' | short; p $STF /feed '{"content":"x","announcement":true}' | short
echo "== surveys"; SV=$(g $STF /surveys | node -pe 'JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,""))[0].id'); p $STF /surveys/$SV/responses '{"answers":{"q1":4,"q2":"About right","q3":"More coffee"}}' | short; p $STF /surveys/$SV/responses '{"answers":{"q1":4}}' | short; g $HR /surveys/$SV/results | cut -c1-200
echo "== services"; p $STF /services '{"category":"IT & equipment","subject":"Laptop is slow","body":"Please check"}' | short
echo "== recruitment (staff forbidden)"; g $STF /recruitment/jobs | short
echo "== public careers"; g x /public/careers/demo | cut -c1-160
JOB=$(g x /public/careers/demo | node -pe 'JSON.parse(require("fs").readFileSync(0).toString().replace(/ \[\d+\]\n?$/,"")).jobs[0].id'); p x /public/careers/demo/jobs/$JOB/apply '{"name":"New Person","email":"np@example.com"}' | short
echo "== reports"; g $OWN /reports/overview | cut -c1-250
echo "== billing"; g $OWN /billing | cut -c1-200
echo "== super admin"; SA=$(curl -s -X POST $B/auth/login -H 'content-type: application/json' -d '{"email":"admin@example.com","password":"ChangeMe123!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token'); g $SA /admin/stats | short; g $OWN /admin/stats | short
echo "== register new tenant + isolation"; NT=$(curl -s -X POST $B/auth/register -H 'content-type: application/json' -d "{\"companyName\":\"Smoke Test $RANDOM\",\"name\":\"Ali\",\"email\":\"smoke$RANDOM$RANDOM@acme.test\",\"password\":\"Password1!\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token'); g $NT /employees | short; g $NT /leave/requests | short; g $NT /payroll/runs | short
echo "== tenant B cannot touch tenant A leave"; p $NT /leave/requests/$LID/decision '{"status":"REJECTED"}' PATCH | short
echo "== dev checkout"; curl -s -X POST $B/billing/checkout -H "authorization: Bearer $NT" -H 'content-type: application/json' -d '{"planCode":"PRO","months":1}'; echo; g $NT /payroll/runs | short
