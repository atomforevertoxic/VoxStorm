using Microsoft.EntityFrameworkCore;
using VoxStorm.Api.Models;

namespace VoxStorm.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }
        
        public DbSet<Session> Sessions { get; set; }
        public DbSet<Participant> Participants { get; set; }
        public DbSet<Idea> Ideas { get; set; }
        
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Configure relationships
            modelBuilder.Entity<Session>()
                .HasMany(s => s.Participants)
                .WithOne(p => p.Session)
                .HasForeignKey(p => p.SessionId)
                .OnDelete(DeleteBehavior.Cascade);
                
            modelBuilder.Entity<Session>()
                .HasMany(s => s.Ideas)
                .WithOne(i => i.Session)
                .HasForeignKey(i => i.SessionId)
                .OnDelete(DeleteBehavior.Cascade);
                
            modelBuilder.Entity<Participant>()
                .HasMany(p => p.Ideas)
                .WithOne(i => i.Participant)
                .HasForeignKey(i => i.ParticipantId)
                .OnDelete(DeleteBehavior.SetNull);
                
            modelBuilder.Entity<Idea>()
                .HasOne(i => i.ParentIdea)
                .WithMany(i => i.ChildIdeas)
                .HasForeignKey(i => i.ParentIdeaId)
                .OnDelete(DeleteBehavior.Restrict);
                
            // Configure table names
            modelBuilder.Entity<Session>().ToTable("Sessions");
            modelBuilder.Entity<Participant>().ToTable("Participants");
            modelBuilder.Entity<Idea>().ToTable("Ideas");
        }
    }
}
