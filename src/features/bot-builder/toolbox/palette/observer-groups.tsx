import { GROUPS, subcategoriesInGroup } from '@/external/bot-skeleton/scratch/blocks/Observer/observer-catalog';
import { localize } from '@deriv-com/translations';
import { Block, Category, Field } from './tags';

/** A stable, id-safe key for a nested category: the palette must not repeat a category id. */
const categorySlug = (category: string) =>
    category
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

export const ObserverGroups = () => (
    <>
            {GROUPS.map(group => (
                <Category key={group.id} id={group.id} name={localize(group.name)}>
                    {subcategoriesInGroup(group).map(entry => (
                        <Category
                            key={`${group.id}__${entry.category}`}
                            id={`${group.id}__${categorySlug(entry.category)}`}
                            name={localize(entry.category)}
                        >
                            {entry.blocks.map(spec => (
                                <Block key={spec.type} type={spec.type}>
                                    {spec.fields.map(field => (
                                        <Field key={field.name} name={field.name}>
                                            {String(field.value)}
                                        </Field>
                                    ))}
                                </Block>
                            ))}
                        </Category>
                    ))}
                </Category>
            ))}
    </>
);
