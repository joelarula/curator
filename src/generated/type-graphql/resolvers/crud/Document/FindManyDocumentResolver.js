"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindManyDocumentResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindManyDocumentArgs_1 = require("./args/FindManyDocumentArgs");
const Document_1 = require("../../../models/Document");
const helpers_1 = require("../../../helpers");
let FindManyDocumentResolver = class FindManyDocumentResolver {
    async documents(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindManyDocumentResolver = FindManyDocumentResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [Document_1.Document], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindManyDocumentArgs_1.FindManyDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindManyDocumentResolver.prototype, "documents", null);
exports.FindManyDocumentResolver = FindManyDocumentResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], FindManyDocumentResolver);
