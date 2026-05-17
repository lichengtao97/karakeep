import { useTranslation } from "@/lib/i18n/server";
import { TFunction } from "i18next";

import serverConfig from "@karakeep/shared/config";

import SidebarItem from "./SidebarItem";
import SidebarVersion from "./SidebarVersion";
import { TSidebarItem } from "./TSidebarItem";

export default async function Sidebar({
  items,
  extraSections,
}: {
  items: (t: TFunction) => TSidebarItem[];
  extraSections?: React.ReactNode;
}) {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <aside className="flex h-[calc(100vh-64px)] w-72 flex-col gap-5 border-r border-slate-200 bg-white p-6">
      <div>
        <ul className="space-y-2 text-sm">
          {items(t).map((item) => (
            <SidebarItem
              key={item.name}
              logo={item.icon}
              name={item.name}
              path={item.path}
              right={
                item.count !== undefined ? (
                  <span className="pr-3 text-xs font-medium text-slate-500">
                    {item.count}
                  </span>
                ) : undefined
              }
            />
          ))}
        </ul>
      </div>
      {extraSections}
      <SidebarVersion
        serverVersion={serverConfig.serverVersion}
        changeLogVersion={serverConfig.changelogVersion}
      />
    </aside>
  );
}
