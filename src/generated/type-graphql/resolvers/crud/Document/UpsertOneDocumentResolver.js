"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpsertOneDocumentResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const UpsertOneDocumentArgs_1 = require("./args/UpsertOneDocumentArgs");
const Document_1 = require("../../../models/Document");
const helpers_1 = require("../../../helpers");
let UpsertOneDocumentResolver = class UpsertOneDocumentResolver {
    async upsertOneDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.upsert({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.UpsertOneDocumentResolver = UpsertOneDocumentResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Document_1.Document, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpsertOneDocumentArgs_1.UpsertOneDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], UpsertOneDocumentResolver.prototype, "upsertOneDocument", null);
exports.UpsertOneDocumentResolver = UpsertOneDocumentResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], UpsertOneDocumentResolver);
