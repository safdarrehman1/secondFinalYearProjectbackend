const service = require("../../../src/modules/job-filtration/interview.service");
const interview=(status)=>({status,history:[]});
describe("interview state machine",()=>{
  test("candidate can confirm a proposal",()=>{const item=interview("proposed");service.transition(item,"confirmed","candidate","Accepted");expect(item.status).toBe("confirmed");expect(item.history[0]).toMatchObject({from:"proposed",to:"confirmed",changedBy:"candidate"})});
  test("confirmed interview can complete",()=>{expect(service.transition(interview("confirmed"),"completed","poster").status).toBe("completed")});
  test.each(["completed","cancelled"])("terminal %s interview cannot transition",status=>{expect(()=>service.transition(interview(status),"confirmed","user")).toThrow(/cannot move/)})
});
