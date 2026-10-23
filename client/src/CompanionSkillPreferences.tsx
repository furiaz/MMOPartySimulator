import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getFirstAidHealingEffectiveness, getSkillPreferenceControls, getSkillPreferences } from "./game/skillBehavior";
import { getSkillPreferenceOptionDetails } from "./game/skillPreferenceDetails";
import { getCompanionSkillRank, getLegacySkillCandidatesForCompanion, getLearnedSkillGroupsForCompanion, isLegacySkillEnabledForCompanion } from "./game/skillProgression";
import type { Companion, SkillId, SkillPreferenceValues } from "./game/types";

function PreferenceOption({ id, details, children }: { id: string; details: string; children: ReactNode }) {
  const anchor = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const show = () => {
    if (!anchor.current || !tooltip.current) return;
    const bounds = anchor.current.getBoundingClientRect();
    const size = tooltip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - size.width - 8)),
      top: Math.max(8, bounds.bottom + size.height + 8 < window.innerHeight ? bounds.bottom + 5 : bounds.top - size.height - 5),
    });
  };
  useEffect(() => {
    if (!position) return;
    const hide = () => setPosition(null);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [position]);
  const bubble = <span ref={tooltip} className="skill-preference-tooltip" id={id} role="tooltip"
    data-open={Boolean(position)} style={position ?? undefined}>{details}</span>;
  return <div ref={anchor} className="skill-preference-option" onMouseEnter={show} onMouseLeave={() => setPosition(null)}
    onFocus={show} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPosition(null); }}>
    {children}
    {typeof document === "undefined" ? bubble : createPortal(bubble, document.body)}
  </div>;
}

export function CompanionSkillPreferences({ member, onChangeSkillBehavior, onSetLegacySkillEnabled }: {
  member: Companion;
  onChangeSkillBehavior: (companionId: string, update: Partial<Companion["skillBehavior"]>) => void;
  onSetLegacySkillEnabled: (companionId: string, skillId: SkillId, enabled: boolean) => void;
}) {
  const skills = getLearnedSkillGroupsForCompanion(member).flatMap(group => group.skills)
    .filter(skill => getSkillPreferenceControls(skill.id).length > 0 &&
      (skill.classId === member.classId || isLegacySkillEnabledForCompanion(member, skill.id)));
  const legacy = getLegacySkillCandidatesForCompanion(member);
  const update = (skillId: SkillId, key: keyof SkillPreferenceValues, value: string | number | boolean) =>
    onChangeSkillBehavior(member.id, { preferencesBySkillId: { [skillId]: { [key]: value } } });

  return <section className="management-section-card" aria-label="Skill Preferences">
    <h3>Skill Preferences</h3>
    <div className="behavior-settings-list">
      {skills.map(skill => {
        const preferences = getSkillPreferences(member, skill.id);
        return <section className="skill-preference-card" aria-label={`${skill.displayName} Preferences`} key={skill.id}>
          <h4>{skill.displayName} <small>Rank {getCompanionSkillRank(member, skill.id)}</small></h4>
          {getSkillPreferenceControls(skill.id).filter(control =>
            (!control.offensiveOnly || preferences.mobilityMode === "offensive") &&
            (control.key !== "defensiveHpThresholdPercent" || preferences.mobilityMode === "defensive"),
          ).map(control => {
            const value = preferences[control.key];
            const id = `preference-${member.id}-${skill.id}-${control.key}`;
            const details = getSkillPreferenceOptionDetails(member, skill.id, control.key, value ?? control.defaultValue);
            if (control.type === "choice") return <div className="behavior-choice-row" key={control.key}>
              <span>{control.label}</span>
              <div className="behavior-choice-group" role="group" aria-label={`${skill.displayName} ${control.label}`}>
                {control.choices?.map(option => <PreferenceOption id={`${id}-${option.value}`} details={getSkillPreferenceOptionDetails(member, skill.id, control.key, option.value)} key={option.value}>
                  <button type="button" className={value === option.value ? "active" : ""} aria-pressed={value === option.value}
                    aria-describedby={`${id}-${option.value}`} onClick={() => update(skill.id, control.key, option.value)}>{option.label}</button>
                </PreferenceOption>)}
              </div>
            </div>;
            if (control.type === "toggle") return <PreferenceOption id={id} details={details} key={control.key}>
              <label className="behavior-toggle-row"><input type="checkbox" checked={Boolean(value)} aria-describedby={id}
                onChange={event => update(skill.id, control.key, event.target.checked)} />{control.label}</label>
            </PreferenceOption>;
            return <PreferenceOption id={id} details={details} key={control.key}>
              <label className="behavior-range-row"><span>{control.label}</span>
                <input type="range" min={control.min} max={control.max} value={Number(value)} aria-describedby={id}
                  onChange={event => update(skill.id, control.key, Number(event.target.value))} />
                <input type="number" min={control.min} max={control.max} value={Number(value)} aria-label={`${skill.displayName} ${control.label}`}
                  aria-describedby={id} onChange={event => update(skill.id, control.key, Number(event.target.value))} />
                <strong>{String(value)}%</strong>
              </label>
              {skill.id === "first_aid" ? <small>Healing effectiveness at this threshold: {Number((getFirstAidHealingEffectiveness(Number(value)) * 100).toFixed(1))}%</small> : null}
            </PreferenceOption>;
          })}
        </section>;
      })}
      {skills.length === 0 ? <span className="party-menu-empty">No skill preferences available</span> : null}
      {legacy.length > 0 ? <section className="companion-skill-summary" aria-label="Legacy skill toggles"><h4>Legacy Skills</h4>
        {legacy.map(skill => <div className="companion-skill-row" key={skill.id}><strong>{skill.displayName}</strong>
          <button type="button" onClick={() => onSetLegacySkillEnabled(member.id, skill.id, !isLegacySkillEnabledForCompanion(member, skill.id))}>
            {isLegacySkillEnabledForCompanion(member, skill.id) ? "Disable" : "Enable"}
          </button></div>)}
      </section> : null}
    </div>
  </section>;
}
