import { adminConfigured, isAdmin } from "@/lib/admin-auth";
import { getCitiesWithCounts, getGroupsWithCity } from "@/db/queries/admin";
import { AdminLogin } from "@/components/admin/admin-login";
import { CitiesAdmin } from "@/components/admin/cities-admin";
import { GroupsAdmin } from "@/components/admin/groups-admin";
import { LogoutButton } from "@/components/admin/logout-button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin — Basera" };

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return <AdminLogin configured={adminConfigured()} />;
  }

  const [cities, groups] = await Promise.all([
    getCitiesWithCounts(),
    getGroupsWithCity(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable cities and manage the Facebook groups the ingestion engine
            scrapes. Disabling a city hides it and all its listings from the app.
          </p>
        </div>
        <LogoutButton />
      </div>

      <CitiesAdmin cities={cities} />
      <GroupsAdmin
        groups={groups}
        cities={cities.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
