using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VoxStorm.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRelevanceToIdea : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Relevance",
                table: "Ideas",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Relevance",
                table: "Ideas");
        }
    }
}
