"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByDocumentResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GroupByDocumentArgs_1 = require("./args/GroupByDocumentArgs");
const Document_1 = require("../../../models/Document");
const DocumentGroupBy_1 = require("../../outputs/DocumentGroupBy");
const helpers_1 = require("../../../helpers");
let GroupByDocumentResolver = class GroupByDocumentResolver {
    async groupByDocument(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
};
exports.GroupByDocumentResolver = GroupByDocumentResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [DocumentGroupBy_1.DocumentGroupBy], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, GroupByDocumentArgs_1.GroupByDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], GroupByDocumentResolver.prototype, "groupByDocument", null);
exports.GroupByDocumentResolver = GroupByDocumentResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], GroupByDocumentResolver);
