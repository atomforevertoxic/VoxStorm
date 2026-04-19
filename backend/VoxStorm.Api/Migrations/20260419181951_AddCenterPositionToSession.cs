using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VoxStorm.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCenterPositionToSession : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "CenterPositionX",
                table: "Sessions",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "CenterPositionY",
                table: "Sessions",
                type: "REAL",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CenterPositionX",
                table: "Sessions");

            migrationBuilder.DropColumn(
                name: "CenterPositionY",
                table: "Sessions");
        }
    }
}
