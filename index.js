module.exports = function registerHook({ services, exceptions, database, env }) {
    const { ServiceUnavailableException, ForbiddenException } = exceptions;
    const slug = require('slug');
    const slugGenerationConfig = [
        {
            collection: 'articles',
            field: 'title',
            slugField: 'slug'
        },
        {
            collection: 'products',
            field: 'title',
            slugField: 'slug'
        }
    ];

    const getUniqueSlug = async (slugConfig, text) => {
        let curSlug = slug(text);
        try {
            let matchingRows = await database(slugConfig.collection)
                .where(slugConfig.slugField, curSlug)
                .then((rows) => { return rows; });
            
            if(matchingRows.length === 0) return curSlug;
            let fallbackCount = text.match(/###(\d+)/);
            if(!fallbackCount) {
                text = `${text}-###1`;
            } else {
                fallbackCount = fallbackCount[1]++;
                fallbackCount++;
                text = text.replace(/###(\d+)/, `###${fallbackCount}`);
            }
            curSlug = await getUniqueSlug(slugConfig, text); 

            return curSlug;
        } catch (error) {
            throw new ServiceUnavailableException(error);
        }
    };

    const generateSlugBase = async (input, collection) => {
        // get matching collection
        let matchingCollections = slugGenerationConfig.filter(function (el) {
            return el.collection === collection;
        });

        if (matchingCollections.length === 0) return input;
        let slugConfig = matchingCollections.pop();

        try {
            let slugPromises = [];
            for(const key of input.keys()) {
                elem = input[key];
                if(elem[slugConfig.field] && !elem[slugConfig.slugField]) {
                    let generatedSlug = await getUniqueSlug(slugConfig, elem[slugConfig.field]);
                    input[key][slugConfig.slugField] = generatedSlug;
                }

                if(elem[slugConfig.slugField]) {
                    let generatedSlug = await getUniqueSlug(slugConfig, elem[slugConfig.slugField]);
                    input[key][slugConfig.slugField] = generatedSlug;
                }

            }
        } catch (error) {
            throw new ServiceUnavailableException(error);
        }

        return input;
    };

    return { 

        'items.create.before': async function (input, { collection, payload, action, item }) {
            return await generateSlugBase(input, collection);
        },
        'items.update.before': async function (input, { collection, payload, action, item }) {
            // don't update slug on multi select
            if (Array.isArray(item)) return input;
            return await generateSlugBase([input], collection);
        },
    };
};
