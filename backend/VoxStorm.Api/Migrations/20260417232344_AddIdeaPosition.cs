using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VoxStorm.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddIdeaPosition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "PositionX",
                table: "Ideas",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "PositionY",
                table: "Ideas",
                type: "REAL",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PositionX",
                table: "Ideas");

            migrationBuilder.DropColumn(
                name: "PositionY",
                table: "Ideas");
        }
    }
}
