using Microsoft.AspNetCore.Mvc;

namespace Backend.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardWidgetsController : ControllerBase
{
    private static readonly DashboardWidget[] Widgets =
    [
        new("revenue", "Revenue", 124500m),
        new("active-users", "Active Users", 1820m),
        new("conversion-rate", "Conversion Rate", 3.4m)
    ];

    [HttpGet]
    public ActionResult<IEnumerable<DashboardWidget>> Get() => Ok(Widgets);
}
