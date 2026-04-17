using Microsoft.EntityFrameworkCore;
using VoxStorm.Api.Data;
using VoxStorm.Api.Models;
using VoxStorm.Api.Services;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
    });
builder.Services.AddOpenApi();

// Configure Entity Framework Core with SQLite
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

// Register LLM service
builder.Services.AddSingleton<ILlmService>(sp => LlmServiceFactory.Create(sp.GetRequiredService<IConfiguration>()));

// Add CORS policy for frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp",
        policy =>
        {
            policy.WithOrigins("http://localhost:3000")
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors("AllowReactApp");
app.MapControllers();

// Auto-migrate database on startup (development only)
if (app.Environment.IsDevelopment())
{
    using (var scope = app.Services.CreateScope())
    {
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        dbContext.Database.Migrate();
    }
}

app.Run();
