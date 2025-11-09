"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFirstDocumentOrThrowResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindFirstDocumentOrThrowArgs_1 = require("./args/FindFirstDocumentOrThrowArgs");
const Document_1 = require("../../../models/Document");
const helpers_1 = require("../../../helpers");
let FindFirstDocumentOrThrowResolver = class FindFirstDocumentOrThrowResolver {
    async findFirstDocumentOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.findFirstOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindFirstDocumentOrThrowResolver = FindFirstDocumentOrThrowResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Document_1.Document, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstDocumentOrThrowArgs_1.FindFirstDocumentOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindFirstDocumentOrThrowResolver.prototype, "findFirstDocumentOrThrow", null);
exports.FindFirstDocumentOrThrowResolver = FindFirstDocumentOrThrowResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], FindFirstDocumentOrThrowResolver);
