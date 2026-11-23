import Breadcrumbs from '../../components/ui/Breadcrumbs.jsx';
import Panel from '../../components/ui/Panel.jsx';

export default function NotImplemented({ title, phase }) {
  return (
    <>
      <Breadcrumbs items={[{ label: 'Home' }, { label: title }]} />
      <h1 className="mb-3">{title}</h1>
      <Panel title="Not yet implemented">
        <p className="p-4 text-[13px]">This screen is planned for build phase {phase} and has no backend yet. It is listed here so navigation matches the final application; no data is shown.</p>
      </Panel>
    </>
  );
}
